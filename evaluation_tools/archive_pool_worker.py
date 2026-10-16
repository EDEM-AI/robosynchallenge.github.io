"""Website-side verified OneDrive relocation; evaluation clients remain unchanged."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import tempfile
import time
import threading
from urllib.parse import quote

import requests


def private_read(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
        raise ValueError("Use private regular credential files")
    return json.loads(path.read_text())


def private_write(path, value):
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_CREAT | os.O_TRUNC | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(value, stream)
    temporary.replace(path)


def runtime_settings(path, default_workers=2):
    settings = private_read(path)
    if not isinstance(settings, dict):
        raise ValueError("Archive worker settings must be an object")
    defaults = {"workers":default_workers, "reserve_gib":2, "poll_seconds":20, "retry_seconds":120}
    limits = {"workers":(1, 4), "reserve_gib":(1, 1024), "poll_seconds":(10, 3600), "retry_seconds":(10, 86400)}
    for name, default in defaults.items():
        value = settings.setdefault(name, default)
        lower, upper = limits[name]
        if type(value) is not int or not lower <= value <= upper:
            raise ValueError("Invalid archive worker option: " + name)
    if type(settings.setdefault("cleanup_enabled", False)) is not bool:
        raise ValueError("cleanup_enabled must be a boolean")
    return settings


def connection_settings(settings):
    return (settings["api_url"], settings["organizer_email"], settings["organizer_token_file"],
            settings.get("proxy", "http://127.0.0.1:7897"))


def cleanup_allowed(path, task_settings):
    # Re-read immediately before deletion; malformed/replaced configuration fails closed.
    try:
        current = runtime_settings(path)
        return current["cleanup_enabled"] and connection_settings(current) == connection_settings(task_settings)
    except (OSError, ValueError, KeyError, TypeError):
        return False


def clean_stale_spools(workspace):
    # The caller holds the exclusive worker lock; only our interrupted transfer caches are removed.
    for child in workspace.glob("transfer-*"):
        if child.is_symlink():
            raise ValueError("Unexpected symlink in private transfer spool")
        if child.is_dir():
            shutil.rmtree(child)


def session(proxy):
    value = requests.Session()
    value.trust_env = False
    if proxy:
        value.proxies = {"https": proxy, "http": proxy}
    return value


class Backend:
    def __init__(self, settings):
        self.settings = settings
        self.transport = session(settings.get("proxy", "http://127.0.0.1:7897"))

    def call(self, action, **fields):
        payload = {"action":action, "reviewer_email":self.settings["organizer_email"],
            "reviewer_token":Path(self.settings["organizer_token_file"]).read_text().strip(), **fields}
        for attempt in range(5):
            try:
                response = self.transport.post(self.settings["api_url"], data=json.dumps(payload),
                    headers={"Content-Type":"text/plain;charset=utf-8"}, timeout=150)
                response.raise_for_status()
                value = response.json()
                if not value.get("ok"):
                    raise ValueError(value.get("error", "Backend rejected archive operation"))
                required = {"reviewer_archive_pool_queue":"items", "reviewer_archive_pool_publish":"location",
                    "reviewer_archive_pool_configure":"configured", "reviewer_resolve_evidence":"download_url",
                    "reviewer_archive_pool_cleanup":"source_removed"}.get(action)
                if required and required not in value:
                    raise requests.ConnectionError("Incomplete archive backend response")
                return value
            except (requests.RequestException, json.JSONDecodeError):
                if attempt == 4:
                    raise
                time.sleep(min(2 ** attempt, 15))


class Drive:
    def __init__(self, path, proxy, stopping=None):
        self.path = Path(path)
        self.profile = private_read(self.path)
        self.transport = session(proxy)
        self.access = ""
        self.expires = 0
        self.stopping = stopping

    def token(self):
        if time.monotonic() < self.expires:
            return self.access
        response = self.transport.post("https://login.microsoftonline.com/" + self.profile["tenant_id"] + "/oauth2/v2.0/token", data={
            "client_id":self.profile["client_id"], "client_secret":self.profile.get("client_secret", ""),
            "grant_type":"refresh_token", "refresh_token":self.profile["refresh_token"],
            "scope":"https://graph.microsoft.com/Files.ReadWrite offline_access"}, timeout=60)
        response.raise_for_status()
        result = response.json()
        self.access = result["access_token"]
        self.expires = time.monotonic() + int(result.get("expires_in", 3600)) - 120
        # Do not rewrite the production ingress owner file: its backend refresh is independent.
        return self.access

    def graph(self, path, method="GET", body=None):
        for attempt in range(5):
            response = self.transport.request(method, "https://graph.microsoft.com/v1.0" + path,
                headers={"Authorization":"Bearer " + self.token()}, json=body, timeout=90)
            if response.status_code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(min(60, max(2, int(response.headers.get("Retry-After", 2 ** attempt)))))
                continue
            response.raise_for_status()
            return None if response.status_code == 204 else response.json()

    @property
    def base(self):
        return "/drives/" + quote(self.profile["drive_id"], safe="")

    def item(self, item_id):
        return self.graph(self.base + "/items/" + quote(item_id, safe=""))

    def at(self, parts):
        return self.graph(self.base + "/items/" + quote(self.profile["root_item_id"], safe="") +
            ":/" + "/".join(quote(value, safe="") for value in parts))

    def folders(self, parts):
        parent = self.profile["root_item_id"]
        for name in parts:
            base = self.base + "/items/" + quote(parent, safe="")
            try:
                item = self.graph(base + ":/" + quote(name, safe=""))
            except requests.HTTPError as error:
                if error.response.status_code != 404:
                    raise
                item = self.graph(base + "/children", "POST", {
                    "@microsoft.graph.conflictBehavior":"fail", "name":name, "folder":{}})
            if "folder" not in item:
                raise ValueError("Archive pool destination is not a folder")
            parent = item["id"]
        return parent

    def stream(self, item):
        url = item.get("@microsoft.graph.downloadUrl", "")
        if not url.startswith("https://"):
            raise ValueError("Missing Microsoft download URL")
        # This session has no default Authorization header, so no token follows signed links.
        response = self.transport.get(url, stream=True, timeout=(30, 120))
        response.raise_for_status()
        return response

    def verify(self, item, expected, sink=None, size_limit=None):
        digest, count = hashlib.sha256(), 0
        with self.stream(item) as response:
            for data in response.iter_content(1024 * 1024):
                if self.stopping is not None and self.stopping.is_set():
                    raise InterruptedError("Transfer stopped safely")
                count += len(data)
                if size_limit is not None and count > size_limit:
                    raise ValueError("Evidence exceeds the registered size")
                digest.update(data)
                if sink is not None:
                    sink.write(data)
        if count != int(item["size"]) or digest.hexdigest() != expected:
            raise ValueError("Evidence SHA256 or byte count differs")
        if self.item(item["id"])["eTag"] != item["eTag"]:
            raise ValueError("Evidence changed during readback")

    def manifest(self, item):
        if not 0 < int(item.get("size", 0)) <= 1024 * 1024:
            raise ValueError("Unexpected manifest size")
        with self.stream(item) as response:
            data = response.raw.read(1024 * 1024 + 1, decode_content=True)
        if len(data) != int(item["size"]):
            raise ValueError("Manifest byte count differs")
        return json.loads(data)

    def upload(self, parent, path):
        base = self.base + "/items/" + quote(parent, safe="") + ":/" + quote(path.name, safe="")
        result = self.graph(base + ":/createUploadSession", "POST", {
            "item":{"@microsoft.graph.conflictBehavior":"replace", "name":path.name}})
        url = result["uploadUrl"]
        if not url.startswith("https://"):
            raise ValueError("Missing Microsoft upload session")
        size, offset = path.stat().st_size, 0
        with path.open("rb") as stream:
            while offset < size:
                if self.stopping is not None and self.stopping.is_set():
                    raise InterruptedError("Transfer stopped safely")
                data = stream.read(10 * 1024 * 1024)
                for attempt in range(5):
                    try:
                        response = self.transport.put(url, data=data, headers={
                            "Content-Length":str(len(data)), "Content-Range":f"bytes {offset}-{offset + len(data) - 1}/{size}"}, timeout=(30, 180))
                        if response.status_code in (429, 500, 502, 503, 504):
                            raise requests.ConnectionError("Temporary upload failure")
                        response.raise_for_status()
                        value = response.json()
                        break
                    except requests.RequestException:
                        if attempt == 4:
                            raise
                        # A lost PUT reply may already have advanced/completed the session.
                        status = self.transport.get(url, timeout=60)
                        if status.status_code in (404, 410) and offset + len(data) == size:
                            return self.graph(base)
                        status.raise_for_status()
                        next_offset = int(status.json()["nextExpectedRanges"][0].split("-")[0])
                        if next_offset == offset + len(data):
                            value = status.json()
                            break
                        if next_offset != offset:
                            raise ValueError("Upload resume offset changed unexpectedly")
                        time.sleep(min(2 ** attempt, 15))
                offset += len(data)
        return self.graph(base)


def choose_slot(drives, size, reserve, reservations=None):
    choices = []
    for slot, drive in drives.items():
        try:
            quota = drive.graph(drive.base + "?$select=quota").get("quota", {})
            remaining = quota.get("remaining")
            available = remaining - (reservations or {}).get(slot, 0) if isinstance(remaining, (int, float)) else -1
            if quota.get("state") not in ("critical", "exceeded") and available >= size + reserve:
                choices.append((available, slot, drive))
        except requests.RequestException:
            continue
    if not choices:
        raise ValueError("No healthy pool account has sufficient reserved capacity")
    _, slot, drive = max(choices, key=lambda value:(value[0], value[1]))
    return slot, drive


def migrate(candidate, source, drives, backend, workspace, report, reserve, cleanup=False):
    started = time.monotonic()
    identity = {"evaluation_id":candidate["evaluation_id"], "task":candidate["task"],
                "upload_id":candidate["upload_id"]}
    location = candidate.get("location")
    if location and location["status"] == "source_removed":
        return
    if location:
        slot, target = location["slot"], drives[location["slot"]]
        target.verify(target.item(location["zip_item_id"]), candidate["sha256"], size_limit=candidate["size"])
    else:
        slot, target = choose_slot(drives, candidate["size"] + 1024 * 1024, reserve)
        if source.profile["drive_id"] == target.profile["drive_id"]:
            raise ValueError("Pool account aliases the ingress drive")
        if shutil.disk_usage(workspace).free < candidate["size"] + reserve:
            raise ValueError("Insufficient private transfer spool space")
        report("copying", slot=slot, **identity, bytes=candidate["size"])
        parts = [candidate["evaluation_id"], candidate["task"], "latest"]
        original, manifest = source.at(parts + ["evidence.zip"]), source.at(parts + ["result.json"])
        if int(original["size"]) != candidate["size"] or source.manifest(manifest) != candidate["record"]:
            raise ValueError("Source result differs from the registered upload")
        parent = target.folders(parts[:2] + [candidate["sha256"]])
        with tempfile.TemporaryDirectory(prefix="transfer-", dir=workspace) as temporary:
            zip_path = Path(temporary) / "evidence.zip"
            with zip_path.open("wb") as sink:
                source.verify(original, candidate["sha256"], sink=sink, size_limit=candidate["size"])
            json_path = Path(temporary) / "result.json"
            json_path.write_text(json.dumps(candidate["record"], ensure_ascii=False))
            saved = target.upload(parent, zip_path)
            target.verify(saved, candidate["sha256"], size_limit=candidate["size"])
            saved_json = target.upload(parent, json_path)
            if target.manifest(saved_json) != candidate["record"]:
                raise ValueError("Destination manifest differs from the registered upload")
            published = backend.call("reviewer_archive_pool_publish", **identity,
                record_hash=candidate["record_hash"], verified_sha256=candidate["sha256"], slot=slot,
                zip_item_id=saved["id"], zip_etag=saved["eTag"], json_item_id=saved_json["id"], json_etag=saved_json["eTag"],
                source_zip_id=original["id"], source_etag=original["eTag"])
            location = published["location"]
    # Resolve through the same authenticated endpoint used by the website before any deletion.
    resolved = backend.call("reviewer_resolve_evidence", evaluation_id=identity["evaluation_id"],
        task=identity["task"], sha256=candidate["sha256"])
    if resolved.get("storage") != location["slot"]:
        raise ValueError("Evidence navigation did not switch to the verified destination")
    if not (cleanup() if callable(cleanup) else cleanup):
        report("ready_copy_only", slot=location["slot"], **identity, bytes=candidate["size"])
        return
    report("cleaning_source", slot=slot, **identity, bytes=candidate["size"])
    backend.call("reviewer_archive_pool_cleanup", **identity, sha256=candidate["sha256"])
    elapsed = time.monotonic() - started
    report("migrated", slot=slot, **identity, bytes=candidate["size"], elapsed_seconds=round(elapsed, 3))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--settings", type=Path, required=True)
    parser.add_argument("--pool-root", type=Path, required=True)
    parser.add_argument("--source-owner", type=Path, required=True)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    if not 1 <= args.workers <= 4:
        raise ValueError("Use 1-4 bounded transfer workers")
    os.umask(0o077)
    workspace = args.pool_root / "spool"
    workspace.mkdir(mode=0o700, parents=True, exist_ok=True)
    if workspace.is_symlink() or workspace.stat().st_mode & 0o077:
        raise ValueError("Transfer spool must be private")
    lock = (args.pool_root / "worker.lock").open("a")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    clean_stale_spools(workspace)
    settings = runtime_settings(args.settings, args.workers)
    backend = Backend(settings)
    proxy = settings.get("proxy", "http://127.0.0.1:7897")
    source = Drive(args.source_owner, proxy)
    status_path = args.pool_root / "worker-status.json"
    registered, retry = {}, {}
    stopping, report_lock = threading.Event(), threading.Lock()
    signal.signal(signal.SIGTERM, lambda *_:stopping.set())
    signal.signal(signal.SIGINT, lambda *_:stopping.set())
    executor = ThreadPoolExecutor(max_workers=4)
    active = {}

    def report(state, **fields):
        value = {"state":state, "updated_at":datetime.now(timezone.utc).isoformat(), **fields}
        with report_lock:
            private_write(status_path, value)
            print(json.dumps(value), flush=True)

    def transfer(candidate, credential, slot, task_settings):
        # Each task owns its HTTP sessions and token caches; no cross-thread credentials/session state.
        task_proxy = task_settings.get("proxy", "http://127.0.0.1:7897")
        origin = Drive(args.source_owner, task_proxy, stopping)
        target = Drive(credential, task_proxy, stopping)
        migrate(candidate, origin, {slot:target}, Backend(task_settings), workspace, report,
                task_settings["reserve_gib"] * 1024 ** 3,
                cleanup=lambda: not stopping.is_set() and cleanup_allowed(args.settings, task_settings))

    while not stopping.is_set():
        processed = False
        try:
            for future in list(active):
                if not future.done():
                    continue
                item = active.pop(future)
                try:
                    future.result()
                except Exception as error:
                    retry[item["key"]] = time.time() + settings["retry_seconds"]
                    report("retry", evaluation_id=item["evaluation_id"], task=item["task"], error_type=type(error).__name__)
            updated = runtime_settings(args.settings, args.workers)
            if connection_settings(updated) != connection_settings(settings):
                if active:
                    # Existing jobs keep their backend and proxy snapshot; do not admit new jobs until drained.
                    stopping.wait(10)
                    continue
                backend = Backend(updated)
                proxy = updated.get("proxy", "http://127.0.0.1:7897")
                source = Drive(args.source_owner, proxy)
                registered.clear()
            if updated != settings:
                report("configuration_reloaded", workers=updated["workers"], cleanup_enabled=updated["cleanup_enabled"])
            settings = updated
            reserve = settings["reserve_gib"] * 1024 ** 3
            drives, ids = {}, {source.profile["drive_id"]}
            for receipt in sorted(args.pool_root.glob("*/account.json")):
                try:
                    account = private_read(receipt)
                    if not account.get("probe", {}).get("roundtrip_sha256_matches"):
                        continue
                    slot = account["slot"]
                    credential = receipt.parent / "owner.json"
                    drive = Drive(credential, proxy)
                    if drive.profile["drive_id"] in ids:
                        continue
                    ids.add(drive.profile["drive_id"])
                    fingerprint = hashlib.sha256(json.dumps(drive.profile, sort_keys=True).encode()).hexdigest()
                    if registered.get(slot) != fingerprint:
                        backend.call("reviewer_archive_pool_configure", slot=slot, storage=drive.profile)
                        registered[slot] = fingerprint
                    drives[slot] = drive
                except Exception as error:
                    report("account_retry", slot=receipt.parent.name, error_type=type(error).__name__)
            candidates = backend.call("reviewer_archive_pool_queue")["items"]
            if args.once:
                candidates.sort(key=lambda row:row["size"])
            for candidate in candidates:
                key = candidate["upload_id"] + ":" + candidate["sha256"]
                location_status = (candidate.get("location") or {}).get("status")
                if location_status == "source_removed" or location_status == "ready" and not settings.get("cleanup_enabled") or retry.get(key, 0) > time.time():
                    continue
                if key in {item["key"] for item in active.values()}:
                    continue
                if len(active) >= settings["workers"]:
                    break
                try:
                    if args.once:
                        migrate(candidate, source, drives, backend, workspace, report, reserve,
                                cleanup=lambda: not stopping.is_set() and cleanup_allowed(args.settings, settings))
                    else:
                        reservations = {}
                        for item in active.values():
                            reservations[item["slot"]] = reservations.get(item["slot"], 0) + item["size"]
                        if shutil.disk_usage(workspace).free < candidate["size"] + sum(item["size"] for item in active.values()) + reserve:
                            raise ValueError("Insufficient reserved transfer spool capacity")
                        slot = candidate["location"]["slot"] if candidate.get("location") else choose_slot(
                            drives, candidate["size"] + 1024 * 1024, reserve, reservations)[0]
                        future = executor.submit(transfer, candidate, drives[slot].path, slot, dict(settings))
                        active[future] = {"key":key, "slot":slot, "size":candidate["size"],
                            "evaluation_id":candidate["evaluation_id"], "task":candidate["task"]}
                except Exception as error:
                    retry[key] = time.time() + settings["retry_seconds"]
                    report("retry", evaluation_id=candidate["evaluation_id"], task=candidate["task"], error_type=type(error).__name__)
                processed = True
                if args.once:
                    break
            if not active:
                report("poll_completed", bytes=0)
            if status_path.exists():
                backend.call("reviewer_archive_pool_heartbeat", status=json.loads(status_path.read_text()))
        except Exception as error:
            report("service_retry", error_type=type(error).__name__)
        if args.once:
            executor.shutdown(wait=True)
            return
        stopping.wait(1 if processed else settings["poll_seconds"])
    executor.shutdown(wait=True, cancel_futures=True)


if __name__ == "__main__":
    main()
