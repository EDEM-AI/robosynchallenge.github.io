"""Record organizer eligibility holds and send their idempotent notices."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets

import requests
from reviewer_pool import private_read, save


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--settings", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--release", action="store_true", help="Release recorded decisions after explicit organizer review")
    parser.add_argument("--reason", help="Required manual review reason for release")
    options = parser.parse_args()
    os.umask(0o077)
    settings = json.loads(private_read(options.settings))
    token = private_read(Path(settings["organizer_token_file"])).strip()
    if not settings["api_url"].startswith("https://script.google.com/macros/s/"):
        raise ValueError("Use the existing official backend")
    plan = json.loads(options.plan.read_text())
    if not isinstance(plan, list) or not plan or len({item["evaluation_id"] for item in plan}) != len(plan):
        raise ValueError("Use a nonempty plan with distinct evaluation IDs")
    session = requests.Session()
    session.trust_env = False

    def api(action, **fields):
        response = session.post(settings["api_url"], data=json.dumps({"action":action,
            "reviewer_email":settings["organizer_email"], "reviewer_token":token, **fields}),
            headers={"Content-Type":"text/plain;charset=utf-8"}, timeout=180)
        response.raise_for_status()
        result = response.json()
        if not result.get("ok"):
            raise ValueError(result.get("error", "Backend rejected " + action))
        return result

    jobs = {job["evaluation_id"]:job for job in api("reviewer_preparation_queue")["jobs"]}
    ledger = json.loads(private_read(options.receipt)) if options.receipt.exists() else {}
    if options.release:
        if not options.reason or not options.reason.strip():
            raise ValueError("Explicit organizer review reason required")
        for item in plan:
            entry = ledger[item["evaluation_id"]]
            result = api("reviewer_release_adjudication", evaluation_id=item["evaluation_id"],
                decision_id=entry["decision_id"], reason=options.reason.strip())
            entry["decision_status"] = result["status"]
            entry["release_reason"] = options.reason.strip()
            save(options.receipt, ledger)
            print(json.dumps({"evaluation_id":item["evaluation_id"], "decision_status":result["status"]}), flush=True)
        return
    for item in plan:
        job = jobs.get(item["evaluation_id"])
        if not job or job.get("code_participant_commit") != item["participant_commit"]:
            raise ValueError("Adopted commit changed; review the current submission before sending")
        if not re.fullmatch(r"[a-f0-9]{40}", item["participant_commit"]):
            raise ValueError("Pin the reviewed commit")
        body = item["body"].format(team_name=job["team_name"], evaluation_id=job["evaluation_id"],
            participant_commit=item["participant_commit"])
        notice = {"subject":item["subject"], "body":body, "reason":item["reason"], "evidence":item["evidence"]}
        existing = ledger.get(job["evaluation_id"])
        if existing and any(existing[key] != notice[key] for key in notice):
            raise ValueError("Recorded notice content changed; review delivery before changing the plan")
        if not existing:
            ledger[job["evaluation_id"]] = {**notice, "email":job["email"], "submission_id":job["submission_id"],
                "participant_commit":item["participant_commit"], "decision_id":"decision_" + secrets.token_hex(16),
                "message_id":"msg_" + secrets.token_hex(16), "mail_status":"pending"}
    save(options.receipt, ledger)
    # Apply every hold before attempting any mail. A delivery failure never releases a hold.
    for item in plan:
        entry = ledger[item["evaluation_id"]]
        result = api("reviewer_set_adjudication", evaluation_id=item["evaluation_id"],
            expected_submission_id=entry["submission_id"], participant_commit=entry["participant_commit"],
            decision_id=entry["decision_id"], reason=entry["reason"], evidence=entry["evidence"])
        entry["decision_status"] = result["status"]
        entry["backup_id"] = result["backup_id"]
        save(options.receipt, ledger)
        print(json.dumps({"evaluation_id":item["evaluation_id"], "decision_status":result["status"]}), flush=True)
    failed = False
    for item in plan:
        entry = ledger[item["evaluation_id"]]
        if entry["mail_status"] != "sent":
            try:
                result = api("reviewer_send_adjudication_notice", evaluation_id=item["evaluation_id"],
                    decision_id=entry["decision_id"], message_id=entry["message_id"], subject=entry["subject"], body=entry["body"])
                entry["mail_status"] = result["status"]
                entry["transport"] = result.get("transport")
                entry.pop("mail_error", None)
            except (ValueError, requests.RequestException) as error:
                entry["mail_error"] = str(error)
                failed = True
            save(options.receipt, ledger)
        print(json.dumps({"evaluation_id":item["evaluation_id"], "email":entry["email"],
            "mail_status":entry["mail_status"], **({"error":entry["mail_error"]} if entry.get("mail_error") else {})}), flush=True)
    if failed:
        raise SystemExit("Holds remain active. Verify recorded delivery errors before retrying mail.")


if __name__ == "__main__":
    main()
