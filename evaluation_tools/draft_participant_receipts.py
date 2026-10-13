"""Audit frozen request versions and write private participant email drafts; never send."""
import argparse
from datetime import datetime, timezone
import json
import html
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request


TASKS = ("click_bell", "drawer_open_place", "mixer_operating", "table_rearrangement", "water_pouring",
         "handle_basket", "items_handover", "item_assembly", "manipulate_pipette", "sample_loading")
DEADLINE = "2026-10-12T12:00:00.000Z"


def timestamp(value):
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Version timestamps must include a timezone")
    return parsed.timestamp()


def legal_selection(record, cutoff):
    if not re.fullmatch(r"[a-f0-9]{40}", str(record.get("revision", ""))):
        return False
    try:
        fields = ["committed_at"] + (["authored_at"] if "authored_at" in record else [])
        return timestamp(record.get("cutoff_at")) == timestamp(cutoff) and all(
            timestamp(record.get(field)) < timestamp(cutoff) for field in fields)
    except (ValueError, TypeError):
        return False


def audit_job(job, manifest=None, remote_tip=None):
    errors = []
    cutoff = job["version_cutoff_at"]
    if timestamp(cutoff) > timestamp(DEADLINE) and not (job.get("preparation_attempt") or job.get("version_exception")):
        errors.append("Late version cutoff has no recorded correction or exception")
    code = (job.get("version_report") or {}).get("code") if job.get("bundle_commit") else job.get("code_selection")
    code = code or {}
    prepared = job.get("bundle_commit") or job.get("code_bundle_commit")
    if prepared:
        if not legal_selection(code, cutoff) or "authored_at" not in code or code.get("revision") != job.get("code_participant_commit"):
            errors.append("Prepared code does not match a legal pinned selection")
        if remote_tip != prepared:
            errors.append("GitHub branch tip differs from the backend receipt")
        if not manifest or any(manifest.get(key) != expected for key, expected in (
            ("evaluation_id", job["evaluation_id"]), ("participant_commit", job.get("code_participant_commit")),
            ("private_base_commit", job.get("code_base_commit")))):
            errors.append("Remote branch manifest differs from the backend")
        if job.get("bundle_commit") and job.get("bundle_commit") != job.get("code_bundle_commit"):
            errors.append("Formal and code-preparation bundle receipts disagree")
    hf = job.get("hf_access") or {}
    links = job.get("task_checkpoint_links") or {}
    for task, record in hf.items():
        if task not in TASKS or not legal_selection(record, cutoff) or record.get("url") != links.get(task) or record.get("accessible") is not True:
            errors.append("Invalid frozen HF receipt: " + task)
    for record in (job.get("hf_sources") or {}).get("report", []):
        if not legal_selection({**record, "cutoff_at":cutoff}, cutoff):
            errors.append("Invalid legacy HF source revision")
    # An unchanged final freeze keeps the original branch and its earlier access
    # check cutoff. Compare the immutable selection, not that historical check time.
    if job.get("bundle_commit") and (set(hf) != set(TASKS) or not matching_hf_receipts(manifest.get("hf_access"), hf, cutoff) or
            (job.get("version_report") or {}).get("hf") != hf or job.get("version_status") != "final"):
        errors.append("Formal branch does not match all ten final HF receipts")
    return {"evaluation_id":job["evaluation_id"], "team_name":job["team_name"], "cutoff_at":cutoff,
            "prepared":bool(prepared), "code_revision":code.get("revision", ""), "hf_receipts":len(hf), "errors":errors}


def matching_hf_receipts(pinned, current, cutoff):
    if not pinned or set(pinned) != set(current):
        return False
    for task, record in pinned.items():
        if {k:v for k,v in record.items() if k != "cutoff_at"} != {k:v for k,v in current[task].items() if k != "cutoff_at"}:
            return False
        try:
            if not legal_selection(record, record.get("cutoff_at")) or timestamp(record["cutoff_at"]) > timestamp(cutoff):
                return False
        except (ValueError, TypeError):
            return False
    return True


def commit_url(job, revision):
    match = re.match(r"https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)", job["code_link"])
    if not match or not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise ValueError("Cannot construct an immutable participant commit link")
    return f"https://github.com/{match[1]}/{match[2].removesuffix('.git')}/tree/{revision}"


def draft(team, job, audit):
    lines = [f"Dear {team} team,", "", "Thank you for participating in RoboSynChallenge.", ""]
    if not job:
        return "RoboSynChallenge - thank you for registering", "\n".join([
            f"Dear {team} team,", "", "Thank you for registering for RoboSynChallenge and for your interest in the competition.", "",
            "Your team registration is on record, but we have not received an eligible evaluation request for your team for the preliminary round.", "",
            "We appreciate your interest and hope you will continue to follow the challenge, its results and future updates. We look forward to further opportunities to connect with you.", "",
            "If you believe a request submitted before the applicable deadline is missing from our records, please reply with its evaluation ID or submission confirmation so that we can check. This notice does not reopen submissions.", "",
            "Thank you again for being part of the RoboSynChallenge community.", "", "Best regards,", "RoboSynChallenge Organizing Team"])
    else:
        lines += ["We have received and recorded your latest eligible evaluation request. Please check the following information:", "",
                  "Team: " + team, "Evaluation ID: " + job["evaluation_id"], "Submission ID: " + job["submission_id"],
                  "Experiment / artifact: " + job["artifact_name"], "Request recorded at (UTC): " + job["created_at"],
                  "Applicable version cutoff (UTC): " + job["version_cutoff_at"]]
        if audit["code_revision"]:
            lines += ["", "Code commit selected for evaluation:",
                      audit["code_revision"] + " | " + commit_url(job, audit["code_revision"])]
        else:
            lines += ["", "Code commit selected for evaluation:",
                      "No legal commit is currently recorded for this request.",
                      "Standard: a confirmed commit from the submitted repository/branch must have both author and commit timestamps strictly before the applicable version cutoff stated above. A later version requires a recorded organizer-requested correction or an explicit approved exception.",
                      "Please await further contact from the organizers.",
                      "Code link on record: " + job["code_link"]]
        if job.get("preparation_attempt"):
            lines += ["Recorded organizer-requested correction round: " + str(job["preparation_attempt"])]
        if job.get("version_exception"):
            lines += ["A separate organizer-approved version exception is recorded for this request."]
        lines += ["", "Checkpoint records and selected versions (a shared model is allowed when documented):"]
        if not job.get("task_checkpoint_links"):
            lines += ["Checkpoint source on record: " + job["checkpoint_link"]]
        for task in TASKS:
            record = (job.get("hf_access") or {}).get(task)
            url = (job.get("task_checkpoint_links") or {}).get(task)
            if not url:
                continue
            lines += [task + ": " + url]
            if record:
                lines += ["  Eligible HF revision: " + record["revision"] + "; committed at (UTC): " + record["committed_at"]]
            else:
                lines += ["  Submitted checkpoint link on record; no frozen revision is stated in this notice."]
        lines += ["", "This email confirms our records, not an evaluation result. Your evaluator may contact you if further clarification is required."]
    lines += ["", "Eligibility and version selection:",
              "- Requests must be recorded before the applicable organizer-authorized submission cutoff. The current normal cutoff is October 12, 2026 at 20:00 Beijing time (12:00 UTC). Email delivery time does not determine eligibility.",
              "- Evaluation uses the latest eligible GitHub and Hugging Face revisions strictly before the applicable cutoff, not later changes on main. GitHub author and commit timestamps and the HF revision timestamp are checked.",
              "- Only a recorded response to an organizer/evaluator-issued correction form, or an explicit organizer-approved exception, can authorize a later version. An ordinary email reply or a post-cutoff push alone does not change the selected version.",
              "- Each evaluation request must cover all 10 tasks with documented policy entrypoints and checkpoints. Only the participant's policy/ tree is retained; the official environment and scoring code are used.",
              "- Code and model files must be accessible to the designated organizer accounts. For restricted HF models, use a visible gated model and grant the individual RoboSynChallenge user access.", "",
              "If any request, commit or checkpoint information above is incorrect, please reply to this email with the evaluation ID and supporting details. Do not create another request solely in response to this notice. If your evaluator requests a correction, use the latest issue email's response form.",
              "", "Thank you again for your participation.", "", "Best regards,", "RoboSynChallenge Organizing Team"]
    return "RoboSynChallenge - participation and evaluation request confirmation", "\n".join(lines)


def prepare_drafts(roster, jobs, audits):
    groups, excluded = {}, []
    for person in roster:
        if person.get("status") != "active":
            continue
        team = str(person.get("team", "")).strip()
        if not team:
            raise ValueError("Active registration is missing its team name")
        if team.casefold() == "test" and str(person.get("intended_use", "")).strip().casefold() == "test":
            excluded.append({"email":person["email"], "team_name":team, "reason":"Explicit test registration"})
            continue
        # Exact approved team names only; never merge by fuzzy matching or affiliation.
        groups.setdefault(team, []).append(person)
    output = []
    for team, people in groups.items():
        accounts = {p["email"].strip().lower() for p in people}
        current = [j for j in jobs if j["email"].lower() in accounts]
        job = max(current, key=lambda j:(timestamp(j["created_at"]), j["submission_id"])) if current else None
        recipient = job["email"] if job else people[0]["email"]
        report = audits.get(job["evaluation_id"]) if job else None
        if report and report["errors"]:
            raise ValueError("Do not issue a version confirmation with failed audit: " + job["evaluation_id"])
        subject, body = draft(team, job, report)
        output.append({"team_name":team, "to":recipient, "other_registered_accounts":sorted(accounts-{recipient.lower()}),
                       "evaluation_id":job["evaluation_id"] if job else "", "subject":subject, "body":body,
                       "expected_identity":participation_identity(job),
                       "status":"draft_not_sent"})
    return output, excluded


def participation_identity(job):
    if not job:
        return ""
    return json.dumps([job["evaluation_id"], job["hf_check_context"], job.get("code_bundle_commit", ""),
                       job.get("bundle_commit", "")], separators=(",", ":"))


def write_private(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)


def html_message(body, title):
    paragraphs = []
    for paragraph in body.split("\n\n"):
        value = html.escape(paragraph)
        value = re.sub(r"https://[^\s<]+", lambda match: '<a style="color:#e9673f" href="' + match[0] + '">' + match[0] + '</a>', value)
        value = re.sub(r"(?<![A-Za-z0-9/])[a-f0-9]{40}(?= \|)", lambda match: '<code style="font-size:13px">' + match[0] + '</code>', value)
        value = value.replace("No legal commit", '<strong style="color:#a33a1f">No legal commit</strong>')
        paragraphs.append('<p style="margin:0 0 16px;overflow-wrap:anywhere">' + value.replace("\n", "<br>") + '</p>')
    return ('<div style="font-family:Arial,sans-serif;color:#142333;line-height:1.55;max-width:720px">'
            '<h2 style="margin:0 0 12px;font-size:22px;color:#142333">' + html.escape(title) + '</h2>'
            '<div style="background:#f8f5ef;border:1px solid #e3ddd2;border-radius:10px;padding:18px">' + ''.join(paragraphs) + '</div>'
            '<p style="color:#65717d;font-size:12px;margin-top:16px">RoboSynChallenge Organizing Team</p></div>')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--settings", type=Path, required=True)
    parser.add_argument("--private-root", type=Path, required=True)
    parser.add_argument("--roster", type=Path, required=True, help="Private snapshot of approved registrations; no tokens")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    sys.path.insert(0, str(args.private_root.resolve() / "tools"))
    from process_queue import api
    settings = json.loads(args.settings.read_text())
    token = Path(settings["organizer_token_file"]).read_text().strip()
    queue = api(settings["api_url"], settings["organizer_email"], token, "reviewer_preparation_queue")
    integrity = api(settings["api_url"], settings["organizer_email"], token, "reviewer_audit_submission_links", repair=False)
    if any(issue["kind"] != "orphan_evaluation" for issue in integrity["issues"]):
        raise ValueError("Submission identity audit failed; no email drafts generated")
    credentials = dict(line.split("=",1) for line in subprocess.check_output(["git","credential","fill"],
        input=b"protocol=https\nhost=github.com\n\n").decode().splitlines() if "=" in line)
    def github(path):
        request = urllib.request.Request("https://api.github.com/repos/ZhaoRunyi/RoboSynChallenge_eval/" + path,
            headers={"Authorization":"Bearer " + credentials["password"], "Accept":"application/vnd.github+json"})
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    import base64
    tips = {row["name"]:row["commit"]["sha"] for row in github("branches?per_page=100")}
    reports = []
    for job in queue["jobs"]:
        revision = job.get("bundle_commit") or job.get("code_bundle_commit")
        manifest = None
        if revision:
            content = github("contents/bundle-manifest.json?ref=" + revision)
            manifest = json.loads(base64.b64decode(content["content"]))
        report = audit_job(job, manifest, tips.get(job["evaluation_id"]))
        reports.append(report)
        print(json.dumps({"evaluation_id":job["evaluation_id"], "prepared":bool(revision), "audit_errors":len(report["errors"])}), flush=True)
    # Refuse drafts if a correction or migration changed the audited queue in flight.
    fresh = api(settings["api_url"], settings["organizer_email"], token, "reviewer_preparation_queue")
    def identities(jobs):
        return sorted(json.dumps([j["evaluation_id"], j["hf_check_context"], j.get("code_bundle_commit"), j.get("bundle_commit")]) for j in jobs)
    if identities(fresh["jobs"]) != identities(queue["jobs"]):
        raise ValueError("Queue changed during audit; rerun before generating drafts")
    audit = {"checked_at":datetime.now(timezone.utc).isoformat(), "integrity":integrity, "requests":reports,
             "prepared_branches":sum(row["prepared"] for row in reports), "errors":sum(len(row["errors"]) for row in reports)}
    write_private(args.output / "version-audit.json", json.dumps(audit, ensure_ascii=False, indent=2))
    if audit["errors"]:
        raise ValueError("Frozen version audit failed; no confirmation drafts generated")
    drafts, excluded = prepare_drafts(json.loads(args.roster.read_text())["registrations"], queue["jobs"],
                                      {row["evaluation_id"]:row for row in reports})
    package = {"schema":1, "created_at":audit["checked_at"], "sent":False, "excluded":excluded, "drafts":drafts}
    write_private(args.output / "drafts.json", json.dumps(package, ensure_ascii=False, indent=2))
    sections = ["# Participant email drafts", "", "DRAFT ONLY. No email has been sent. No correction link is opened.", ""]
    for row in drafts:
        sections += ["## " + row["team_name"], "", "To: " + row["to"], "Subject: " + row["subject"], "", row["body"], "", "---", ""]
    write_private(args.output / "drafts.md", "\n".join(sections))
    print(json.dumps({"teams":len(drafts), "with_request":sum(bool(r["evaluation_id"]) for r in drafts),
                      "without_request":sum(not r["evaluation_id"] for r in drafts), "prepared_branches_audited":audit["prepared_branches"],
                      "audit_errors":audit["errors"], "sent":False}), flush=True)


if __name__ == "__main__":
    main()
