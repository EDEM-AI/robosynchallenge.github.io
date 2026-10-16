"""Website deployment policy: completed evaluations never receive automatic code updates."""
from contextvars import ContextVar
from functools import wraps
import fcntl
import json
import os
from pathlib import Path
import secrets
from types import SimpleNamespace


def completed(job):
    stages = (job.get("workflow") or {}).get("stages") or []
    return len(stages) > 3 and stages[3].get("done") is True


def preservation_reason(job):
    if completed(job):
        return "completed_snapshot_preserved"
    stages = (job.get("workflow") or {}).get("stages") or []
    if (len(stages) > 1 and stages[1].get("done") is True) or any(
            job.get(key) for key in ("results", "uploads", "task_commands")):
        return "in_progress_snapshot_preserved"
    return ""


def install(process, upgrades):
    if getattr(process, "completed_evaluation_policy_installed", False):
        return
    active = ContextVar("website_preparation_operation", default=None)
    original_api = process.api
    blocked = process.preparation_blocked
    process.preparation_blocked = lambda job: bool(preservation_reason(job)) or blocked(job)

    def guarded_api(url, email, token, action, **fields):
        operation = active.get()
        if operation and fields.get("evaluation_id") == operation["evaluation_id"]:
            fields["preparation_operation"] = operation["id"]
        response = original_api(url, email, token, action, **fields)
        if action == "reviewer_preparation_queue" and isinstance(response.get("jobs"), list):
            # Fresh/corrected requests should not wait behind a full sweep of pinned tool upgrades.
            return {**response, "jobs":sorted(response["jobs"], key=lambda row:bool(row.get("bundle_commit") or row.get("code_bundle_commit")))}
        return response

    process.api = upgrades.api = guarded_api

    def scoped(original):
        @wraps(original)
        def prepare(args, job, token, **kwargs):
            reason = preservation_reason(job)
            if reason:
                return {"evaluation_id":job["evaluation_id"], "state":reason}
            root = Path(args.work_dir) / "publication-claims"
            root.mkdir(mode=0o700, parents=True, exist_ok=True)
            if root.is_symlink() or root.stat().st_mode & 0o077:
                raise ValueError("Publication claims must be private")
            identity = job["evaluation_id"]
            if not identity.startswith("eval_") or not identity[5:].isalnum():
                raise ValueError("Invalid preparation request identity")
            with (root / (identity + ".lock")).open("a") as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    return {"evaluation_id":identity, "state":"publisher_busy"}
                fresh = original_api(args.api_url, args.email, token, "reviewer_preparation_queue")
                current = next(row for row in fresh["jobs"] if row["evaluation_id"] == identity)
                reason = preservation_reason(current)
                if reason:
                    return {"evaluation_id":identity, "state":reason}
                if blocked(current):
                    return {"evaluation_id":identity, "state":"evaluation_blocked"}
                # An interrupted publication retains its operation ID for safe recovery.
                previous = current.get("bundle_commit") or current.get("code_bundle_commit") or ""
                receipt = root / (identity + ".json")
                saved = json.loads(receipt.read_text()) if receipt.exists() else {}
                operation_id = saved.get("operation_id") if saved.get("expected_bundle_commit") == previous else None
                operation_id = operation_id or secrets.token_hex(32)
                temporary = receipt.with_suffix(".tmp")
                descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
                with os.fdopen(descriptor, "w") as stream:
                    json.dump({"operation_id":operation_id, "expected_bundle_commit":previous}, stream)
                    stream.flush()
                    os.fsync(stream.fileno())
                temporary.replace(receipt)
                original_api(args.api_url, args.email, token, "reviewer_claim_preparation", evaluation_id=identity,
                    preparation_operation=operation_id, expected_bundle_commit=previous, context_json=current["hf_check_context"])
                operation = {"id":operation_id, "evaluation_id":identity, "attempted_push":False}
                context = active.set(operation)
                succeeded = False
                try:
                    result = original(args, current, token, **kwargs)
                    succeeded = True
                    return result
                finally:
                    active.reset(context)
                    # A lost push/registration reply must not unlock stage four around an unregistered Git head.
                    if succeeded or not operation["attempted_push"]:
                        original_api(args.api_url, args.email, token, "reviewer_release_preparation",
                            evaluation_id=identity, preparation_operation=operation_id)
                        receipt.unlink(missing_ok=True)
        return prepare

    def guarded_publish(original):
        @wraps(original)
        def publish(repository, branch, checkout, expected, backups):
            operation = active.get()
            if not operation or operation["evaluation_id"] != branch:
                raise ValueError("Publication requires a website preparation claim")
            operation["attempted_push"] = True
            return original(repository, branch, checkout, expected, backups)
        return publish

    process.prepare_code = scoped(process.prepare_code)
    process.prepare_one = scoped(process.prepare_one)
    upgrades.upgrade = scoped(upgrades.upgrade)
    process.publish = guarded_publish(process.publish)
    upgrades.publish = guarded_publish(upgrades.publish)
    original_once = process.process_once

    @wraps(original_once)
    def once(args):
        # Legacy retirement treats absent latest requests as deletable, including historical completed branches.
        effective = SimpleNamespace(**vars(args))
        effective.retire_generated_branches = False
        result = original_once(effective)
        if getattr(args, "retire_generated_branches", False):
            result["cleanup_deferred"] = "completed_history_protected"
        for row in result.get("skipped", []):
            if row.get("reason") == "evaluation_blocked":
                row["reason"] = "evaluation_blocked_or_snapshot_preserved"
        return result

    process.process_once = once
    process.completed_evaluation_policy_installed = True
