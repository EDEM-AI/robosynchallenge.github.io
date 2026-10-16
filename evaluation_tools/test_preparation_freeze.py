from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from preparation_freeze import completed, install


class FreezeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.job = {"evaluation_id":"eval_abc", "bundle_commit":"a"*40, "hf_check_context":"context",
                    "workflow":{"stages":[{"done":True}]*3 + [{"done":False}, {"done":False}]}}
        self.api = Mock(side_effect=lambda *args, **kwargs: {"jobs":[self.job]} if args[3] == "reviewer_preparation_queue" else {"ok":True})
        self.publish = Mock(return_value="b"*40)
        def upgrade(args, job, token):
            self.upgrades.publish("repo", job["evaluation_id"], "checkout", "a"*40, "backups")
            self.upgrades.api(args.api_url, args.email, token, "reviewer_migrate_bundle", evaluation_id=job["evaluation_id"])
            return {"state":"upgraded"}
        self.process = SimpleNamespace(api=self.api, preparation_blocked=lambda job:bool(job.get("evaluation_blocked")),
            prepare_code=Mock(), prepare_one=Mock(), publish=self.publish,
            process_once=Mock(return_value={"skipped":[]}))
        self.upgrades = SimpleNamespace(api=self.api, upgrade=upgrade, publish=self.publish)
        self.args = SimpleNamespace(work_dir=Path(self.directory.name), api_url="https://example.test", email="organizer@example.test",
                                    retire_generated_branches=True)
        install(self.process, self.upgrades)

    def test_fourth_stage_freezes_even_without_fifth_stage(self):
        self.job["workflow"]["stages"][3]["done"] = True
        self.assertTrue(completed(self.job))
        self.assertTrue(self.process.preparation_blocked(self.job))
        self.assertEqual(self.upgrades.upgrade(self.args,self.job,"synthetic")["state"],"completed_snapshot_preserved")
        self.api.assert_not_called()
        self.publish.assert_not_called()
        self.assertFalse(completed({"workflow":{"stages":[{"done":True}]*3}}))

    def test_fresh_completion_blocks_stale_job_before_claim_or_push(self):
        from copy import deepcopy
        stale = deepcopy(self.job)
        self.job["workflow"]["stages"][3]["done"] = True
        self.assertEqual(self.upgrades.upgrade(self.args,stale,"synthetic")["state"],"completed_snapshot_preserved")
        self.assertEqual(self.api.call_count,1)
        self.publish.assert_not_called()

    def test_claim_precedes_publish_and_operation_reaches_migration(self):
        self.upgrades.upgrade(self.args,self.job,"synthetic")
        actions = [call.args[3] for call in self.api.call_args_list]
        self.assertEqual(actions,["reviewer_preparation_queue","reviewer_claim_preparation","reviewer_migrate_bundle","reviewer_release_preparation"])
        claim, migrate = self.api.call_args_list[1:3]
        self.assertEqual(claim.kwargs["preparation_operation"], migrate.kwargs["preparation_operation"])
        self.assertEqual(len(claim.kwargs["preparation_operation"]),64)
        self.assertEqual(list((self.args.work_dir / "publication-claims").glob("*.json")),[])

    def test_uncertain_push_keeps_claim_and_retry_reuses_operation(self):
        self.publish.side_effect = TimeoutError("Unknown push result")
        for _ in range(2):
            with self.assertRaises(TimeoutError):
                self.upgrades.upgrade(self.args,self.job,"synthetic")
        claims = [c for c in self.api.call_args_list if c.args[3] == "reviewer_claim_preparation"]
        self.assertEqual(claims[0].kwargs["preparation_operation"],claims[1].kwargs["preparation_operation"])
        self.assertNotIn("reviewer_release_preparation",[c.args[3] for c in self.api.call_args_list])

    def test_lost_migration_reply_keeps_publication_claim(self):
        original = self.api.side_effect
        def fail(*args, **kwargs):
            if args[3] == "reviewer_migrate_bundle":
                raise TimeoutError("Registration response lost")
            return original(*args, **kwargs)
        self.api.side_effect = fail
        with self.assertRaises(TimeoutError):
            self.upgrades.upgrade(self.args,self.job,"synthetic")
        self.publish.assert_called_once()
        self.assertNotIn("reviewer_release_preparation",[c.args[3] for c in self.api.call_args_list])
        receipts = list((self.args.work_dir / "publication-claims").glob("*.json"))
        self.assertEqual(len(receipts),1)
        self.assertEqual(receipts[0].stat().st_mode & 0o077,0)

    def test_denied_claim_never_calls_git_publish(self):
        original = self.api.side_effect
        def fail(*args, **kwargs):
            if args[3] == "reviewer_claim_preparation":
                raise ValueError("Completed while waiting for claim")
            return original(*args, **kwargs)
        self.api.side_effect = fail
        with self.assertRaises(ValueError):
            self.upgrades.upgrade(self.args,self.job,"synthetic")
        self.publish.assert_not_called()

    def test_unscoped_publication_and_legacy_retirement_are_disabled(self):
        with self.assertRaises(ValueError):
            self.process.publish("repo","eval_abc","checkout","a"*40,"backups")
        result = self.process.process_once(self.args)
        self.assertTrue(self.args.retire_generated_branches)
        self.assertEqual(result["cleanup_deferred"],"completed_history_protected")


if __name__ == "__main__":
    unittest.main()
