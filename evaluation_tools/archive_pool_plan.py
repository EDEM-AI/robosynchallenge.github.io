"""Read-only migration planning from private Graph and reviewer snapshots."""
import argparse
from collections import defaultdict
import json
import re
from urllib.parse import unquote


def plan(jobs, files, root_folder="RoboSynChallenge_eval"):
    pairs = defaultdict(dict)
    ambiguous = set()
    prefix = root_folder.strip("/") + "/"
    for item in files:
        if "file" not in item or item.get("name") not in ("evidence.zip", "result.json"):
            continue
        path = unquote(str(item.get("parentReference", {}).get("path", "")))
        if "/root:/" not in path:
            continue
        path = path.split("/root:/", 1)[1]
        if not path.startswith(prefix):
            continue
        parts = path[len(prefix):].split("/")
        if len(parts) != 3 or parts[2] != "latest":
            continue
        identity = tuple(parts[:2])
        if not re.fullmatch(r"eval_[a-f0-9]+", identity[0]) or not re.fullmatch(r"[a-z_]+", identity[1]):
            continue
        if item["name"] in pairs[identity]:
            ambiguous.add(identity)
        pairs[identity][item["name"]] = item
    candidates, skipped = [], []
    for job in jobs:
        evaluation = job["evaluation_id"]
        uploads = defaultdict(list)
        results = defaultdict(list)
        for row in job.get("uploads", []):
            uploads[row["task"]].append(row)
        for row in job.get("results", []):
            results[row["task"]].append(row)
        for task in sorted(uploads.keys() | results.keys()):
            identity = (evaluation, task)
            pair = pairs.get(identity, {})
            reason = ""
            if len(uploads[task]) != 1 or uploads[task][0].get("status") != "completed":
                reason = "upload_not_registered_complete"
            elif len(results[task]) != 1 or results[task][0].get("status") not in ("submitted", "checked"):
                reason = "result_not_registered"
            elif identity in ambiguous or len(pair) != 2:
                reason = "missing_or_ambiguous_zip_json_pair"
            elif not re.fullmatch(r"[a-f0-9]{64}", str(results[task][0].get("artifacts", {}).get("sha256", ""))):
                reason = "missing_registered_sha256"
            elif any(not row.get("id") or not row.get("eTag") or int(row.get("size", 0)) <= 0
                     for row in pair.values()):
                reason = "missing_source_identity_or_size"
            if reason:
                skipped.append({"evaluation_id": evaluation, "task": task, "reason": reason})
                continue
            candidates.append({"evaluation_id": evaluation, "task": task,
                "sha256": results[task][0]["artifacts"]["sha256"],
                "bytes": sum(int(row["size"]) for row in pair.values()),
                "source": {name: {key: row[key] for key in ("id", "eTag", "size")}
                           for name, row in pair.items()}})
    return {"read_only": True, "migration_enabled": False, "candidates": candidates,
            "skipped": skipped, "candidate_bytes": sum(row["bytes"] for row in candidates)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", type=argparse.FileType("r"), required=True)
    parser.add_argument("--inventory", type=argparse.FileType("r"), required=True)
    args = parser.parse_args()
    jobs, inventory = json.load(args.queue), json.load(args.inventory)
    print(json.dumps(plan(jobs["jobs"], inventory["files"]), indent=2))


if __name__ == "__main__":
    main()
