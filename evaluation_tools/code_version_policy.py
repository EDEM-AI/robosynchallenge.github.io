"""Apply organizer-approved code-only policies without changing evaluation bundles."""
from contextvars import ContextVar
from datetime import datetime, timezone
from functools import wraps
import re
import subprocess


def latest_code_allowed(job):
    policy = job.get("code_version_policy") or {}
    return (policy.get("mode") == "latest_reachable" and
            all(policy.get(key) for key in ("reason", "approved_by", "approved_at")))


def select_tip(checkout, revision, cutoff):
    fields = subprocess.check_output(
        ["git", "show", "-s", "--format=%H%n%cI%n%aI", revision + "^{commit}", "--"],
        cwd=checkout, text=True).strip().splitlines()
    if len(fields) != 3 or not re.fullmatch(r"[a-f0-9]{40}", fields[0]):
        raise ValueError("The submitted ref must resolve to one immutable commit")
    times = [datetime.fromisoformat(value.replace("Z", "+00:00")) for value in fields[1:]]
    if any(value.tzinfo is None for value in times):
        raise ValueError("Commit timestamps must include their timezone")
    return {"revision": fields[0], "committed_at": times[0].astimezone(timezone.utc).isoformat(),
            "authored_at": times[1].astimezone(timezone.utc).isoformat(), "cutoff_at": cutoff,
            "policy": "latest_reachable"}


def install(process):
    if getattr(process, "organizer_code_policy_installed", False):
        return
    active = ContextVar("organizer_latest_code", default=False)
    original_select = process.select_git

    def select(checkout, revision, cutoff):
        return (select_tip if active.get() else original_select)(checkout, revision, cutoff)

    def scoped(original):
        @wraps(original)
        def prepare(*args, **kwargs):
            job = kwargs.get("job") if "job" in kwargs else args[1]
            context = active.set(latest_code_allowed(job))
            try:
                return original(*args, **kwargs)
            finally:
                active.reset(context)
        return prepare

    process.select_git = select
    process.prepare_code = scoped(process.prepare_code)
    process.prepare_one = scoped(process.prepare_one)
    process.organizer_code_policy_installed = True
