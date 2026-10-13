"""Deploy selected Apps Script files while preserving unrelated remote source."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

import requests


def private_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with os.fdopen(os.open(path, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600), "w") as stream:
        json.dump(value, stream, indent=2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1] / "apps-script")
    parser.add_argument("--settings", type=Path, required=True)
    parser.add_argument("--name", action="append", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--inspect", action="store_true")
    options = parser.parse_args()
    settings = json.loads(options.settings.read_text())
    project = json.loads((options.source / ".clasp.json").read_text())["scriptId"]
    credential = json.loads((Path.home() / ".clasprc.json").read_text())["tokens"]["default"]
    session = requests.Session()
    session.trust_env = False
    session.proxies = {"https": "http://127.0.0.1:7897"}
    auth = session.post("https://oauth2.googleapis.com/token", data={"grant_type":"refresh_token",
        **{key:credential[key] for key in ("client_id", "client_secret", "refresh_token")}}, timeout=40)
    auth.raise_for_status()
    session.headers["Authorization"] = "Bearer " + auth.json()["access_token"]

    def api(path, method="GET", body=None):
        result = session.request(method, "https://script.googleapis.com/v1/" + path, json=body, timeout=90)
        if not result.ok:
            raise RuntimeError("Apps Script API HTTP " + str(result.status_code) + ": " + result.json().get("error", {}).get("message", "Request rejected"))
        result.raise_for_status()
        return result.json()

    remote = api("projects/" + project + "/content")
    deployments = api("projects/" + project + "/deployments")["deployments"]
    deployment = next(row for row in deployments if any(
        item.get("webApp", {}).get("url", "").split("?")[0] == settings["api_url"] for item in row.get("entryPoints", [])))
    byname = {item["name"]:item for item in remote["files"]}
    inspected = []
    for name in options.name:
        source = (options.source / (name + ".gs")).read_text()
        baseline = subprocess.run(["git", "show", "HEAD:apps-script/" + name + ".gs"], cwd=options.source.parent,
            capture_output=True, text=True)
        current = byname.get(name)
        if current and current["source"] not in (source, baseline.stdout):
            raise ValueError("Remote " + name + " differs from the local baseline; reconcile before deployment")
        inspected.append({"name":name, "changed":not current or current["source"] != source})
        byname[name] = {"name":name, "type":"SERVER_JS", "source":source}
    print(json.dumps({"files":inspected, "deployment":deployment["deploymentId"], "inspect_only":options.inspect}), flush=True)
    if options.inspect:
        return
    backup = options.receipt.with_name(options.receipt.stem + "-before.json")
    private_json(backup, {"content":remote, "deployment":deployment})
    # Apps Script requires the entire project; retain every file not selected above.
    api("projects/" + project + "/content", "PUT", {"files":[
        {key:item[key] for key in ("name", "type", "source")} for item in byname.values()]})
    version = api("projects/" + project + "/versions", "POST", {"description":"Reviewer test access and MailApp registration delivery " + str(int(time.time()))})
    config = {**deployment["deploymentConfig"], "versionNumber":version["versionNumber"]}
    api("projects/" + project + "/deployments/" + deployment["deploymentId"], "PUT", {"deploymentConfig":config})
    private_json(options.receipt, {"project_id":project, "deployment_id":deployment["deploymentId"],
        "version":version["versionNumber"], "files":inspected, "backup":str(backup),
        "file_sha256":{name:hashlib.sha256(byname[name]["source"].encode()).hexdigest() for name in options.name}})
    print(json.dumps({"status":"deployed", "version":version["versionNumber"]}), flush=True)


if __name__ == "__main__":
    main()
