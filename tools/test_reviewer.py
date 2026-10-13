"""Start/restore a five-request, browser-local reviewer test on the existing backend."""
import argparse
import json
import os
from pathlib import Path
import secrets
import sys
import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "evaluation_system"))
from recheck_mail_submissions import backend_api, save_receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--settings", type=Path, required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--previous-email", default="fengkailiu59@gmail.com")
    parser.add_argument("--restore", action="store_true")
    options = parser.parse_args()
    os.umask(0o077)
    settings = json.loads(options.settings.read_text())
    token = Path(settings["organizer_token_file"]).read_text().strip()
    path = options.settings.parent / ("tester-invitation-" + options.email + ".json")
    session = requests.Session()
    session.trust_env = False
    def api(action, **fields):
        # Target email is a payload field, separate from organizer authentication.
        response = session.post(settings["api_url"], data=json.dumps({
            "action":action, "reviewer_email":settings["organizer_email"],
            "reviewer_token":token, **fields}),
            headers={"Content-Type":"text/plain;charset=utf-8"}, timeout=120)
        response.raise_for_status()
        result = response.json()
        if not result.get("ok"):
            raise ValueError(result.get("error", "Backend rejected " + action))
        return result
    if options.restore:
        ledger = json.loads(path.read_text())
        result = api("reviewer_restore_test_assignment", test_id=ledger["test_id"])
        ledger["status"] = "restored"
        save_receipt(path, ledger)
        print(json.dumps({"status":"restored", "email":options.email, "evaluation_ids":result["evaluation_ids"]}))
        return
    if path.exists():
        ledger = json.loads(path.read_text())
        if ledger["email"] != options.email or ledger["previous_email"] != options.previous_email or ledger["status"] == "restored":
            raise ValueError("Existing test identity differs or has already been restored")
    else:
        queue = api("reviewer_preparation_queue")
        jobs = [job for job in queue["jobs"] if job.get("reviewer_email") == options.previous_email]
        ready = [job for job in jobs if job.get("bundle_commit") and job.get("preparation_status") == "ready"
            and len(job.get("hf_access", {})) == 10 and all(row.get("accessible") for row in job["hf_access"].values())]
        blocked = [job for job in jobs if not job.get("bundle_commit") and job.get("preparation_status") == "failed"]
        if len(ready) < 4 or not blocked:
            raise ValueError("Need four prepared requests and one genuinely blocked request from the specified evaluator")
        bad = next((job for job in blocked if job["team_name"] == "USTC-AC"), blocked[0])
        selected = ready[:4] + [bad]
        ledger = {"email":options.email, "previous_email":options.previous_email,
            "token":"act_" + secrets.token_hex(32), "invitation_id":"invite_" + secrets.token_hex(16),
            "test_id":"test_" + secrets.token_hex(16), "status":"pending", "mail_status":"pending",
            "evaluation_ids":[job["evaluation_id"] for job in selected],
            "teams":[job["team_name"] for job in selected]}
        save_receipt(path.with_name(path.stem + "-before.json"), queue)
        save_receipt(path, ledger)
    api("reviewer_provision_account", email=options.email, role="tester", eval_token=ledger["token"])
    result = api("reviewer_start_test_assignment", email=options.email, previous_email=options.previous_email,
        test_id=ledger["test_id"], evaluation_ids=ledger["evaluation_ids"])
    ledger["status"] = result["status"]
    ledger["backups"] = result["backups"]
    save_receipt(path, ledger)
    visible = backend_api(settings["api_url"], options.email, ledger["token"], "reviewer_queue")
    if visible["reviewer"]["role"] != "tester" or {job["evaluation_id"] for job in visible["jobs"]} != set(ledger["evaluation_ids"]):
        raise ValueError("Tester visibility does not match the five assigned requests")
    print(json.dumps({"status":"assigned", "email":options.email, "evaluation_ids":ledger["evaluation_ids"], "teams":ledger["teams"]}, ensure_ascii=False), flush=True)
    if ledger["mail_status"] == "pending":
        try:
            mail = api("reviewer_send_invitation", email=options.email, eval_token=ledger["token"], invitation_id=ledger["invitation_id"])
            ledger["mail_status"] = mail["status"]
        except ValueError as error:
            if "quota exhausted" not in str(error):
                raise
            ledger["mail_status"] = "mailapp_quota_exhausted"
        save_receipt(path, ledger)
    print(json.dumps({"email":options.email, "mail_status":ledger["mail_status"]}), flush=True)


if __name__ == "__main__":
    main()
