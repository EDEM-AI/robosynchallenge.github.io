"""Manage the Sheet-backed evaluator pool without changing participant identities."""
import argparse
import json
import os
import re
from pathlib import Path
import secrets
import urllib.request


def private_read(path):
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError("Organizer credential and settings files must be private")
    return path.read_text()


def save(path, value):
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(value, stream, indent=2)
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--settings", type=Path, required=True)
    actions = parser.add_subparsers(dest="command", required=True)
    actions.add_parser("list")
    actions.add_parser("balance")
    policy = actions.add_parser("policy")
    policy.add_argument("--minimum-evaluators", type=int, choices=range(1, 101), required=True)
    policy.add_argument("--pause", action="store_true")
    member = actions.add_parser("member")
    member.add_argument("--email", required=True)
    member.add_argument("--inactive", action="store_true")
    invite = actions.add_parser("add")
    invite.add_argument("--email", required=True)
    resend = actions.add_parser("resend")
    resend.add_argument("--email", required=True)
    resend.add_argument("--delivery-id", required=True, help="Stable invite_ followed by 32 hex digits; reuse when retrying")
    move = actions.add_parser("move-email")
    move.add_argument("--previous-email", required=True)
    move.add_argument("--email", required=True)
    args = parser.parse_args()
    os.umask(0o077)
    settings = json.loads(private_read(args.settings))
    token = private_read(Path(settings["organizer_token_file"])).strip()
    url = settings["api_url"]
    if not url.startswith("https://script.google.com/macros/s/"):
        raise ValueError("Use the existing Apps Script deployment URL")

    def api(action, **fields):
        request = urllib.request.Request(url, json.dumps({"action": action,
            "reviewer_email": settings["organizer_email"], "reviewer_token": token, **fields}).encode(),
            {"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=180) as response:
            result = json.load(response)
        if not result.get("ok"):
            raise ValueError(result.get("error", "Pool operation failed"))
        return result

    if args.command == "list":
        result = api("reviewer_pool")
    elif args.command == "balance":
        result = api("reviewer_balance_pool")
    elif args.command == "policy":
        result = api("reviewer_set_pool", enabled=not args.pause, minimum_evaluators=args.minimum_evaluators)
    elif args.command == "member":
        result = api("reviewer_set_pool", email=args.email, active=not args.inactive)
    elif args.command == "move-email":
        previous, email = args.previous_email.strip().lower(), args.email.strip().lower()
        if any(not re.fullmatch(r"[a-z0-9._+-]+@[a-z0-9.-]+", value) for value in (previous, email)) or previous == email:
            raise ValueError("Enter two different valid emails")
        old_receipt = args.settings.parent / ("evaluator-invitation-" + previous + ".json")
        receipt = args.settings.parent / ("evaluator-invitation-" + email + ".json")
        old = json.loads(private_read(old_receipt))
        if old["email"] != previous:
            raise ValueError("Invitation identity changed")
        if receipt.exists():
            ledger = json.loads(private_read(receipt))
            if ledger["email"] != email or ledger["token"] != old["token"]:
                raise ValueError("Target invitation conflicts with the original evaluator")
        else:
            ledger = {"email": email, "token": old["token"], "invitation_id": "invite_" + secrets.token_hex(16), "status": "pending"}
            save(receipt, ledger)
        result = api("reviewer_move_evaluator_email", previous_email=previous, email=email)
        if ledger["status"] != "sent":
            sent = api("reviewer_send_invitation", email=email, eval_token=ledger["token"], invitation_id=ledger["invitation_id"])
            ledger["status"] = sent["status"]
            save(receipt, ledger)
        old["status"] = "moved"
        old["moved_to"] = email
        save(old_receipt, old)
        result["invitation_status"] = ledger["status"]
    elif args.command == "resend":
        email = args.email.strip().lower()
        if not re.fullmatch(r"[a-z0-9._+-]+@[a-z0-9.-]+", email) or not re.fullmatch(r"invite_[a-f0-9]{32}", args.delivery_id):
            raise ValueError("Enter a valid email and stable invitation delivery ID")
        ledger = json.loads(private_read(args.settings.parent / ("evaluator-invitation-" + email + ".json")))
        if ledger["email"] != email:
            raise ValueError("Invitation identity changed")
        result = api("reviewer_send_invitation", email=email, eval_token=ledger["token"], invitation_id=args.delivery_id)
        save(args.settings.parent / ("evaluator-redelivery-" + args.delivery_id + ".json"), result)
    else:
        email = args.email.strip().lower()
        if email.count("@") != 1 or not all(part and all(char.isalnum() or char in "._-+" for char in part) for part in email.split("@")):
            raise ValueError("Enter a valid email address")
        existing = next((account for account in api("reviewer_pool")["accounts"] if account["email"] == email), None)
        receipt = args.settings.parent / ("evaluator-invitation-" + email + ".json")
        if receipt.exists():
            ledger = json.loads(private_read(receipt))
            if ledger["email"] != email:
                raise ValueError("Invitation identity changed")
        else:
            if existing:
                raise ValueError("This account already exists. Use member; do not rotate or change observer credentials")
            ledger = {"email": email, "token": "act_" + secrets.token_hex(32),
                      "invitation_id": "invite_" + secrets.token_hex(16), "status": "pending"}
            save(receipt, ledger)
        if existing and existing["role"] != "evaluator":
            raise ValueError("Observers and organizers cannot be converted into pool members")
        if ledger["status"] != "sent":
            api("reviewer_provision_account", email=email, role="evaluator", eval_token=ledger["token"])
            sent = api("reviewer_send_invitation", email=email, eval_token=ledger["token"], invitation_id=ledger["invitation_id"])
            ledger["status"] = sent["status"]
            save(receipt, ledger)
        result = api("reviewer_balance_pool")
        result["invitation_status"] = ledger["status"]
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit("Evaluator pool: " + str(error))
