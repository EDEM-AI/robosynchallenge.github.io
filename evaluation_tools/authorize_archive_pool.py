"""Stage a separate OneDrive pool account; never replace production storage."""
import argparse
import importlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def private_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(value, stream)


def receive_authorization(helper, binary, directory, timeout):
    version = subprocess.check_output([str(binary), "version"], text=True).splitlines()[0]
    if version != "rclone " + helper.RCLONE_VERSION:
        raise ValueError("Use the previously verified rclone binary")
    import base64
    config = base64.urlsafe_b64encode(json.dumps({
        "access_scopes": "Files.ReadWrite User.Read offline_access"}).encode()).decode().rstrip("=")
    output = directory / "rclone-output.private"
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    environment = {**os.environ, "RCLONE_ONEDRIVE_ACCESS_SCOPES": "Files.ReadWrite User.Read offline_access"}
    for key in ("RCLONE_ONEDRIVE_DISABLE_SITE_PERMISSION", "RCLONE_ONEDRIVE_CLIENT_ID",
                "RCLONE_ONEDRIVE_CLIENT_SECRET", "RCLONE_ONEDRIVE_ACCESS_SCOPES"):
        environment.pop(key, None)
    environment["RCLONE_ONEDRIVE_ACCESS_SCOPES"] = "Files.ReadWrite User.Read offline_access"
    process = None
    try:
        with os.fdopen(descriptor, "w") as stream:
            process = subprocess.Popen([str(binary), "authorize", "onedrive", config,
                "--auth-no-open-browser"], stdout=stream, stderr=subprocess.STDOUT, env=environment)
        deadline, shown = time.monotonic() + timeout, False
        while process.poll() is None:
            if time.monotonic() >= deadline:
                raise TimeoutError("Browser authorization expired; rerun the same command")
            text = output.read_text()
            link = re.search(r"http://(?:127\.0\.0\.1|localhost):53682/auth\?[^\s\"<>]+", text)
            if link and not shown:
                print("Open in your browser: " + link.group(0), flush=True)
                shown = True
            time.sleep(0.5)
        if process.returncode:
            raise ValueError("Microsoft authorization was denied or interrupted")
        for line in output.read_text().splitlines():
            token = helper.parse_authorization(line)
            if token:
                return token
        raise ValueError("No supported rclone authorization result was received")
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        output.unlink(missing_ok=True)


def target_identity(helper, token, source, expected_email):
    identity = helper.graph("/me?$select=userPrincipalName,mail", token["access_token"])
    addresses = {str(identity.get(key) or "").lower() for key in ("mail", "userPrincipalName")} - {""}
    if not addresses or (expected_email and expected_email.lower() not in addresses):
        raise ValueError("The signed-in Microsoft account does not match the requested destination")
    drive = helper.graph("/me/drive", token["access_token"])
    if not drive.get("id") or drive["id"] == source["drive_id"]:
        raise ValueError("Sign in with a different OneDrive account, not the current upload owner")
    email = str(identity.get("mail") or identity.get("userPrincipalName")).lower()
    return email, drive


def ensure_folder(helper, token, name):
    path = "/me/drive/root:/" + urllib.parse.quote(name, safe="") + "?$select=id,folder"
    try:
        item = helper.graph(path, token["access_token"])
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        request = urllib.request.Request("https://graph.microsoft.com/v1.0/me/drive/root/children",
            method="POST", headers={"Authorization": "Bearer " + token["access_token"],
            "Content-Type": "application/json"}, data=json.dumps({
                "@microsoft.graph.conflictBehavior": "fail", "name": name, "folder": {}}).encode())
        with urllib.request.urlopen(request, timeout=45) as response:
            item = json.load(response)
    if not isinstance(item.get("folder"), dict) or not item.get("id"):
        raise ValueError("Pool destination is not a OneDrive folder")
    return item


def authorization_receipt(directory, slot, email, drive):
    value = {"slot": slot, "provider": "onedrive", "email": email,
             "drive_id": drive["id"], "quota": drive.get("quota", {}),
             "status": "authorized_pending_probe", "migration_enabled": False,
             "production_upload_owner_changed": False}
    path = directory / "authorization-checked.json"
    if not path.exists():
        private_json(path, value)
    print(json.dumps(value), flush=True)


def main():
    workspace = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-root", type=Path, default=workspace / "robosynchallenge_heldout_private")
    parser.add_argument("--rclone", type=Path, default=workspace / "evaluation_system/.runtime/rclone-v1.75.2/rclone")
    parser.add_argument("--source-owner", type=Path, default=workspace / "evaluation_system/.runtime/onedrive-owner.json")
    parser.add_argument("--pool-root", type=Path, default=workspace / "evaluation_system/.runtime/archive-pool")
    parser.add_argument("--slot", default="onedrive-02")
    parser.add_argument("--email", default="")
    parser.add_argument("--probe-mib", type=int, default=100)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--authorize-only", action="store_true",
                        help="Only sign in, read identity/quota and save private credentials; no cloud file writes")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,40}", args.slot) or not 1 <= args.probe_mib <= 1024:
        raise ValueError("Use a named pool slot and a 1-1024 MiB synthetic probe")
    if args.source_owner.is_symlink() or args.source_owner.stat().st_mode & 0o077:
        raise ValueError("Source owner profile must be a private regular file")
    source = json.loads(args.source_owner.read_text())
    sys.path.insert(0, str(args.private_root.resolve() / "tools"))
    helper = importlib.import_module("authorize_onedrive_rclone")
    os.umask(0o077)
    args.pool_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if args.pool_root.is_symlink() or args.pool_root.stat().st_mode & 0o077:
        raise ValueError("Pool credentials directory must be private and not a symlink")
    directory = args.pool_root / args.slot
    directory.mkdir(mode=0o700, exist_ok=True)
    if directory.is_symlink() or directory.stat().st_mode & 0o077:
        raise ValueError("Pool slot directory must be private and not a symlink")
    owner, pending, receipt = (directory / name for name in ("owner.json", "authorization.pending", "account.json"))
    if receipt.exists():
        raise ValueError("This pool slot already has a receipt; use another slot")
    if not owner.exists():
        if pending.exists():
            if pending.is_symlink() or pending.stat().st_mode & 0o077:
                raise ValueError("Pending authorization must be private")
            cached = json.loads(pending.read_text())
            token = helper.post("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
                "client_id": helper.RCLONE_CLIENT, "client_secret": helper.default_client_secret(),
                "grant_type": "refresh_token", "refresh_token": cached["refresh_token"],
                "scope": "https://graph.microsoft.com/Files.ReadWrite https://graph.microsoft.com/User.Read offline_access"})
            if not helper.parse_authorization(json.dumps(token)):
                raise ValueError("Pending authorization requires a fresh browser login")
        else:
            print("Forward SSH port 53682, then sign in with the NEW destination OneDrive account.", flush=True)
            token = receive_authorization(helper, args.rclone, directory, args.timeout)
            private_json(pending, token)
        email, drive = target_identity(helper, token, source, args.email)
        if args.authorize_only:
            authorization_receipt(directory, args.slot, email, drive)
            return
        folder = "RoboSynChallenge_evidence_pool"
        ensure_folder(helper, token, folder)
        helper.save_owner_profile(owner, pending, token, email, folder)
    else:
        if owner.is_symlink() or owner.stat().st_mode & 0o077:
            raise ValueError("Pool owner profile must be private")
        saved = json.loads(owner.read_text())
        token = helper.post("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            "client_id": saved["client_id"], "client_secret": saved["client_secret"],
            "grant_type": "refresh_token", "refresh_token": saved["refresh_token"],
            "scope": "https://graph.microsoft.com/Files.ReadWrite https://graph.microsoft.com/User.Read offline_access"})
        email, drive = target_identity(helper, token, source, args.email)
    if args.authorize_only:
        authorization_receipt(directory, args.slot, email, drive)
        return
    print("Destination confirmed: " + email + "; synthetic round-trip probe starting.", flush=True)
    from probe_onedrive import probe
    result = probe(owner, args.probe_mib)
    if not result.get("roundtrip_sha256_matches"):
        raise ValueError("Destination probe did not verify SHA256")
    private_json(receipt, {"slot": args.slot, "provider": "onedrive", "email": email,
        "drive_id": drive["id"], "credential_file": str(owner.resolve()), "probe": result,
        "production_upload_owner_changed": False, "migration_enabled": False})
    print(json.dumps({"slot": args.slot, "email": email, "roundtrip_sha256_matches": True,
        "receipt": str(receipt), "production_upload_owner_changed": False,
        "migration_enabled": False}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Pool authorization/probe stopped (" + type(error).__name__ + "). No production storage was changed.", file=sys.stderr)
        raise SystemExit(1)
