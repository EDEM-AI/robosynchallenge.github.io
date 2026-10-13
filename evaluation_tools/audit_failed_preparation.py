"""Read submitted repositories at pre-cutoff commits; never execute participant code."""
import argparse
import base64
from datetime import datetime
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import quote

import requests


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with os.fdopen(os.open(path, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600), "w") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", type=Path, required=True)
    parser.add_argument("--private-root", type=Path, required=True)
    parser.add_argument("--settings", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    sys.path.insert(0, str(options.private_root / "tools"))
    from compose_submission import scan_policy_adapters
    from process_queue import participant_repository
    settings = json.loads(options.settings.read_text())
    session = requests.Session()
    session.trust_env = False
    session.proxies = {"https":"http://127.0.0.1:7897"}
    session.headers.update({"Authorization":"Bearer " + Path(settings["participant_token_file"]).read_text().strip(),
        "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28"})
    identity = session.get("https://api.github.com/user", timeout=35)
    identity.raise_for_status()
    if identity.json().get("login") != "robosynchallenge":
        raise ValueError("Use the designated participant-read account")
    rows = []
    for job in json.loads(options.queue.read_text())["jobs"]:
        if job.get("preparation_status") != "failed":
            continue
        row = {key:job.get(key) for key in ("evaluation_id", "team_name", "code_link", "preparation_error", "version_cutoff_at")}
        try:
            repository, tail = participant_repository(job["code_link"])
            repo = repository.removeprefix("https://github.com/").removesuffix(".git")
            root = "https://api.github.com/repos/" + repo
            metadata = session.get(root, timeout=35)
            row["repository_http_status"] = metadata.status_code
            metadata.raise_for_status()
            ref = tail or metadata.json()["default_branch"]
            commit = session.get(root + "/commits/" + quote(ref, safe=""), timeout=35)
            row["submitted_ref_http_status"] = commit.status_code
            commit.raise_for_status()
            tip = commit.json()
            limit = datetime.fromisoformat(job["version_cutoff_at"].replace("Z", "+00:00"))
            def legal(item):
                return all(datetime.fromisoformat(item["commit"][field]["date"].replace("Z", "+00:00")) < limit for field in ("author", "committer"))
            if not legal(tip):
                history = session.get(root + "/commits", params={"sha":tip["sha"], "until":job["version_cutoff_at"], "per_page":100}, timeout=35)
                history.raise_for_status()
                eligible = [item for item in history.json() if legal(item)]
                if not eligible:
                    raise ValueError("No legal commit in inspected pre-cutoff history")
                tip = max(eligible, key=lambda item:item["commit"]["committer"]["date"])
            row["inspected_commit"] = tip["sha"]
            tree = session.get(root + "/git/trees/" + tip["sha"], params={"recursive":1}, timeout=50)
            tree.raise_for_status()
            if tree.json().get("truncated"):
                raise ValueError("Repository tree truncated; do not infer missing files")
            paths = {item["path"] for item in tree.json()["tree"] if item["type"] == "blob"}
            row["has_policy_tree"] = any(path.startswith("policy/") for path in paths)
            if row["has_policy_tree"]:
                try:
                    adapters, incomplete = scan_policy_adapters({path:b"" for path in paths if path.startswith("policy/")})
                    row.update(complete_adapters=adapters, incomplete_adapters=incomplete,
                        classification="unused_incomplete_adapter_blocked_valid_policy" if adapters and incomplete else "no_complete_adapter" if not adapters else "complete_adapters")
                except ValueError as error:
                    row.update(classification="no_adapter", structural_error=str(error))
            else:
                row["classification"] = "no_policy_tree_at_inspected_commit"
            documents = [path for path in paths if path.lower() in ("readme.md", "readme") or re.fullmatch(r"policy/[^/]+/README\.md", path)]
            row["documentation"] = {}
            for path in sorted(documents)[:15]:
                response = session.get(root + "/contents/" + path, params={"ref":tip["sha"]}, timeout=35)
                if response.status_code == 200 and response.json().get("encoding") == "base64":
                    row["documentation"][path] = base64.b64decode(response.json()["content"]).decode("utf-8", errors="replace")[:30000]
            row["policy_paths"] = sorted(path for path in paths if path.startswith("policy/"))
        except requests.RequestException as error:
            row["classification"] = "repository_or_submitted_ref_access_failed"
            row["error_type"] = type(error).__name__
        except ValueError as error:
            row.update(classification="audit_incomplete", error=str(error))
        rows.append(row)
        save(options.output, {"scope":"Read-only structural inspection; version selection remains the production preparer responsibility", "rows":rows})
        print(json.dumps({key:row.get(key) for key in ("team_name", "evaluation_id", "classification", "repository_http_status", "submitted_ref_http_status", "inspected_commit", "complete_adapters", "incomplete_adapters")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
