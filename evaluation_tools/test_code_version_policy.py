"""Offline regressions for account-scoped Git selection; no preparation jobs run."""
from datetime import datetime
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from code_version_policy import install, latest_code_allowed


# Load the production strict selector without importing any auth/queue helpers.
SELECTOR_PATH = (Path(__file__).resolve().parents[2]
                 / "robosynchallenge_heldout_private/tools/version_selection.py")
spec = importlib.util.spec_from_file_location("strict_code_version_selection", SELECTOR_PATH)
strict = importlib.util.module_from_spec(spec)
spec.loader.exec_module(strict)
CUTOFF = strict.DEADLINE
APPROVAL = {"mode": "latest_reachable", "reason": "Explicit code-only approval",
            "approved_by": "admin@example.com", "approved_at": "2026-10-16T00:00:00Z"}


class CodeVersionPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="code-policy-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.git("init", "-q")
        self.old = self.commit("old", "2026-10-10T00:00:00Z")
        self.future = self.commit("future ancestor", "2032-01-01T00:00:00Z")
        self.tip = self.commit("graph tip", "2026-10-14T00:00:00Z",
                               authored="2026-10-13T00:00:00Z")
        self.strict_select = Mock(wraps=strict.select_git)
        self.process = SimpleNamespace(select_git=self.strict_select)

        def prepare(args, job, token, *, revision="HEAD", fail=False):
            selected = self.process.select_git(self.root, revision, CUTOFF)
            if fail:
                raise RuntimeError("Preparation interrupted")
            return selected

        self.process.prepare_code = prepare
        self.process.prepare_one = prepare
        install(self.process)
        self.approved = {"email": "1035603730@qq.com", "code_version_policy": dict(APPROVAL)}
        self.normal = {"email": "normal@example.com"}

    def git(self, *args, dates=None):
        environment = {**os.environ, "GIT_CONFIG_NOSYSTEM": "1",
                       "GIT_CONFIG_GLOBAL": os.devnull, "GIT_TERMINAL_PROMPT": "0",
                       "GIT_AUTHOR_NAME": "Offline Test", "GIT_AUTHOR_EMAIL": "test@example.com",
                       "GIT_COMMITTER_NAME": "Offline Test", "GIT_COMMITTER_EMAIL": "test@example.com"}
        environment.update(dates or {})
        return subprocess.check_output(
            ["git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", *args],
            cwd=self.root, env=environment, text=True, stderr=subprocess.PIPE).strip()

    def commit(self, message, committed, authored=None):
        self.git("commit", "--allow-empty", "-q", "-m", message,
                 dates={"GIT_COMMITTER_DATE": committed, "GIT_AUTHOR_DATE": authored or committed})
        return self.git("rev-parse", "HEAD")

    def test_strict_selector_keeps_predeadline_commit_despite_future_ancestor(self):
        result = self.process.select_git(self.root, "HEAD", CUTOFF)
        self.assertEqual(result["revision"], self.old)
        self.assertNotIn("policy", result)
        self.strict_select.assert_called_once()

    def test_both_preparation_hooks_select_graph_tip_not_maximum_commit_date(self):
        for name in ("prepare_code", "prepare_one"):
            with self.subTest(hook=name):
                selected = getattr(self.process, name)(None, self.approved, "synthetic")
                self.assertEqual(selected["revision"], self.tip)
                self.assertNotEqual(selected["revision"], self.future)
                self.assertEqual(selected["policy"], "latest_reachable")
                self.assertEqual(selected["cutoff_at"], CUTOFF)
                self.assertEqual(selected["committed_at"], "2026-10-14T00:00:00+00:00")
                self.assertEqual(selected["authored_at"], "2026-10-13T00:00:00+00:00")
        self.strict_select.assert_not_called()

    def test_immutable_sha_remains_the_selection_anchor(self):
        for revision in (self.old, self.future, self.tip):
            with self.subTest(revision=revision):
                selected = self.process.prepare_one(None, self.approved, "synthetic", revision=revision)
                self.assertEqual(selected["revision"], revision)
        self.assertEqual(self.process.select_git(self.root, self.future, CUTOFF)["revision"], self.old)

    def test_unapproved_jobs_delegate_unchanged_through_both_hooks(self):
        for name in ("prepare_code", "prepare_one"):
            with self.subTest(hook=name):
                selected = getattr(self.process, name)(None, self.normal, "synthetic")
                self.assertEqual(selected, strict.select_git(self.root, "HEAD", CUTOFF))
        self.assertEqual(self.strict_select.call_count, 2)

    def test_context_resets_after_success_and_exception_for_both_hooks(self):
        for name in ("prepare_code", "prepare_one"):
            hook = getattr(self.process, name)
            with self.subTest(hook=name):
                self.assertEqual(hook(None, self.approved, "synthetic")["revision"], self.tip)
                self.assertEqual(self.process.select_git(self.root, "HEAD", CUTOFF)["revision"], self.old)
                with self.assertRaisesRegex(RuntimeError, "Preparation interrupted"):
                    hook(None, self.approved, "synthetic", fail=True)
                self.assertEqual(self.process.select_git(self.root, "HEAD", CUTOFF)["revision"], self.old)
                self.assertEqual(hook(None, self.normal, "synthetic")["revision"], self.old)

    def test_keyword_job_and_install_idempotence(self):
        hooks = (self.process.select_git, self.process.prepare_code, self.process.prepare_one)
        install(self.process)
        self.assertEqual(hooks, (self.process.select_git, self.process.prepare_code, self.process.prepare_one))
        result = self.process.prepare_code(args=None, job=self.approved, token="synthetic")
        self.assertEqual(result["revision"], self.tip)
        self.assertTrue(self.process.organizer_code_policy_installed)

    def test_missing_approval_metadata_and_malformed_modes_never_waive_dates(self):
        policies = [None, {}, {"mode": "latest_reachable"},
                    {**APPROVAL, "mode": "deadline"}, {**APPROVAL, "mode": "unknown"},
                    {**APPROVAL, "mode": ["latest_reachable"]}, {**APPROVAL, "mode": {}}]
        for field in ("reason", "approved_by", "approved_at"):
            missing = dict(APPROVAL)
            del missing[field]
            policies.extend([missing, {**APPROVAL, field: ""}, {**APPROVAL, field: None}])
        for policy in policies:
            with self.subTest(policy=policy):
                job = {"email": self.approved["email"], "code_version_policy": policy}
                self.assertFalse(latest_code_allowed(job))
                for name in ("prepare_code", "prepare_one"):
                    selected = getattr(self.process, name)(None, job, "synthetic")
                    self.assertEqual(selected["revision"], self.old)
                    self.assertNotIn("policy", selected)

    def test_nonmapping_policy_fails_closed_without_leaking_context(self):
        for policy in ("latest_reachable", [dict(APPROVAL)], 1):
            with self.subTest(policy=policy):
                job = {"code_version_policy": policy}
                with self.assertRaises((AttributeError, TypeError, ValueError)):
                    self.process.prepare_one(None, job, "synthetic")
                self.assertEqual(self.process.select_git(self.root, "HEAD", CUTOFF)["revision"], self.old)

    def test_unreachable_or_invalid_ref_is_not_replaced_with_head(self):
        for revision in ("does-not-exist", "f" * 40):
            with self.subTest(revision=revision):
                with self.assertRaises(subprocess.CalledProcessError):
                    self.process.prepare_code(None, self.approved, "synthetic", revision=revision)
                self.assertEqual(self.process.select_git(self.root, "HEAD", CUTOFF)["revision"], self.old)

    def test_hf_selector_remains_strict_even_inside_approved_preparation(self):
        commits = [SimpleNamespace(commit_id=key * 40,
                   created_at=datetime.fromisoformat(stamp.replace("Z", "+00:00")))
                   for key, stamp in (("a", "2026-10-12T11:59:59Z"),
                                      ("b", CUTOFF), ("c", "2032-01-01T00:00:00Z"))]

        def prepare(args, job, token):
            self.assertEqual(process.select_git(self.root, "HEAD", CUTOFF)["revision"], self.tip)
            return strict.select_hf(commits, CUTOFF)

        process = SimpleNamespace(select_git=strict.select_git, prepare_code=prepare, prepare_one=prepare)
        install(process)
        self.assertEqual(process.prepare_one(None, self.approved, "synthetic"),
                         ("a" * 40, "2026-10-12T11:59:59+00:00"))
        with self.assertRaises(strict.NoLegalVersion):
            strict.select_hf(commits[1:], CUTOFF)


if __name__ == "__main__":
    unittest.main()
