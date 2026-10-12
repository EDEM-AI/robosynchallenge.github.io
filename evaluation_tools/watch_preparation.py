"""Maintain source checks and retry organizer failures before the existing private preparer."""
import argparse
from datetime import datetime, timezone
import importlib
import json
import os
from pathlib import Path
import re
import sys
import time


def transient(message):
    return bool(re.search(r"SSL|TLS|EOF|timeout|timed out|锁超时|占用锁|HTTP (?:429|5\d\d)|ConnectionError|ConnectionReset|connection aborted|Temporary failure|RemoteDisconnected|\['git', 'push'|Official source|Output must be new", str(message), re.I))


def source_urls(value):
    text = str(value).strip()
    if not text:
        raise ValueError("No checkpoint repository was provided; record URLs for all ten tasks.")
    urls = re.findall(r"https://huggingface\.co/[^\s;,<>]+", text)
    if not urls:
        urls = [item.strip() for item in re.split(r"[\s;,]+", text) if item.strip()]
    if len(urls) > 20:
        raise ValueError("Too many checkpoint source links; provide the ten task URLs explicitly.")
    return list(dict.fromkeys(urls))


def audit_deadlines(jobs, timestamp=None):
    current = datetime.now(timezone.utc).timestamp() if timestamp is None else timestamp
    def seconds(value):
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError('A version timestamp must include its timezone')
        return parsed.timestamp()
    rows = []
    for job in jobs:
        cutoff = job['version_cutoff_at']
        limit = seconds(cutoff)
        report = job.get('version_report') or {}
        code = report.get('code') if job.get('bundle_commit') else job.get('code_selection')
        code = code or {}
        code_valid = bool(re.fullmatch(r'[a-f0-9]{40}', code.get('revision', '')))
        try:
            code_valid = code_valid and seconds(code.get('cutoff_at')) == limit and all(
                seconds(code.get(field)) < limit for field in ('authored_at', 'committed_at'))
            if job.get('bundle_commit'):
                code_valid = code_valid and code.get('revision') == job.get('code_participant_commit') and \
                    job.get('bundle_commit') == job.get('code_bundle_commit')
        except (ValueError, TypeError):
            code_valid = False
        hf = report.get('hf') or {}
        links = job.get('task_checkpoint_links') or {}
        hf_valid = len(hf) == len(links) == 10
        try:
            hf_valid = hf_valid and all(row.get('accessible') is True and row.get('url') == links.get(task) and
                bool(re.fullmatch(r'[a-f0-9]{40}', row.get('revision', ''))) and
                isinstance(row.get('files_checked'), int) and 0 < row['files_checked'] <= 10000 and
                seconds(row.get('cutoff_at')) == limit and seconds(row.get('committed_at')) < limit
                for task, row in hf.items())
        except (ValueError, TypeError):
            hf_valid = False
        errors = [job.get('preparation_error'), job.get('hf_check_error')]
        if current < limit:
            state = 'awaiting_cutoff'
        elif job.get('preparation_status') == 'failed' or job.get('hf_check_status') == 'failed':
            state = 'blocked'
        elif job.get('bundle_commit') and job.get('version_status') == 'final' and code_valid and hf_valid:
            state = 'frozen'
        elif job.get('version_status') == 'final':
            state = 'invalid_final_receipt'
        elif job.get('coverage_status') == 'legacy_unverified' and code_valid:
            state = 'code_frozen_awaiting_task_mapping'
        else:
            state = 'awaiting_final_preparation'
        rows.append({'evaluation_id':job['evaluation_id'], 'team_name':job.get('team_name', ''),
            'cutoff_at':cutoff, 'state':state, 'code_revision':code.get('revision', ''),
            'bundle_commit':job.get('bundle_commit', ''), 'error':next((value for value in errors if value), '')})
    counts = {state:sum(row['state'] == state for row in rows) for state in sorted({row['state'] for row in rows})}
    return {'checked_at':datetime.fromtimestamp(current, timezone.utc).isoformat(), 'counts':counts, 'requests':rows}


def check_sources(value, token_file, cutoff):
    from hf_access import HF_OFFICIAL_ENDPOINT, model_location, read_token
    from huggingface_hub import HfApi, hf_hub_url, get_hf_file_metadata
    from version_selection import select_hf
    api = HfApi(endpoint=HF_OFFICIAL_ENDPOINT)
    token = read_token(token_file)
    result = []
    for url in source_urls(value):
        try:
            repo, revision, prefix = model_location(url)
        except ValueError as error:
            raise ValueError("A model repository URL is required, not an HF profile or organization page: " + url) from error
        revision, committed = select_hf(api.list_repo_commits(repo, revision=revision, token=token), cutoff)
        info = api.model_info(repo, revision=revision, token=token)
        if info.private:
            raise ValueError("Private HF repositories are unsupported. Use visible gated models and grant the individual RoboSynChallenge user access.")
        files = [item.rfilename for item in info.siblings if not prefix or item.rfilename == prefix or item.rfilename.startswith(prefix.rstrip('/') + '/')]
        if not files:
            raise ValueError("No files exist at the submitted checkpoint source and selected revision.")
        sample = next((name for name in files if name.endswith(('.safetensors', '.bin', '.pt', '.pth', '.tar.gz'))), files[0])
        get_hf_file_metadata(hf_hub_url(repo, sample, revision=info.sha, endpoint=HF_OFFICIAL_ENDPOINT), token=token, timeout=30)
        result.append({"url":HF_OFFICIAL_ENDPOINT + '/' + repo + (('/tree/' + revision + '/' + prefix) if prefix else ''),
            "revision":info.sha, "accessible":True, "files_checked":1, "sample_file":sample,
            "available_files":len(files), "gated":bool(info.gated), "committed_at":committed,
            "scope":"source_access_only_not_task_mapping"})
    return result


def maintain(settings, state):
    from process_queue import api
    from version_selection import cutoff_seconds
    token = Path(settings['organizer_token_file']).read_text().strip()
    queue = api(settings['api_url'], settings['organizer_email'], token, 'reviewer_preparation_queue')
    events = []
    pending = []
    retries = state.setdefault('retries', {})
    hf_file = Path(settings.get('hf_token_file', Path(settings['organizer_token_file']).parent / 'huggingface-RoboSynChallenge.token'))
    for job in queue['jobs']:
        messages = [job.get('preparation_error', ''), job.get('hf_check_error', '')]
        message = next((text for text in messages if transient(text)), '')
        key = json.dumps([job['evaluation_id'],job.get('hf_check_context'),message])
        previous = retries.get(key, {})
        if message and not job.get('bundle_commit') and time.time() >= previous.get('next_at', 0):
            api(settings['api_url'], settings['organizer_email'], token, 'reviewer_retry_preparation', evaluation_id=job['evaluation_id'])
            count = previous.get('attempts', 0) + 1
            retries[key] = {'attempts':count, 'next_at':time.time() + min(3600, 60 * 2 ** min(count, 6))}
            events.append({'evaluation_id':job['evaluation_id'], 'state':'organizer_failure_retry_queued'})
        if job.get('coverage_status') != 'legacy_unverified':
            continue
        saved = job.get('hf_sources') or {}
        if saved.get('status') == 'passed':
            continue
        if saved.get('checked_at'):
            checked = datetime.fromisoformat(saved['checked_at'].replace('Z', '+00:00')).timestamp()
            if time.time() - checked < (120 if saved.get('status') == 'retry' else 3600):
                continue
        if not job.get('reviewer_email'):
            api(settings['api_url'], settings['organizer_email'], token, 'reviewer_ensure_run', evaluation_id=job['evaluation_id'])
        cutoff = job['version_cutoff_at']
        if time.time() < cutoff_seconds(cutoff):
            cutoff = datetime.now(timezone.utc).isoformat()
        try:
            report = check_sources(job.get('checkpoint_link'), hf_file, cutoff)
            status, message = 'passed', ''
        except Exception as error:
            http = getattr(getattr(error, 'response', None), 'status_code', None)
            status = 'retry' if http == 429 or (http and http >= 500) or transient(str(error)) or transient(type(error).__name__) else 'failed'
            message = ('HTTP ' + str(http) + ': source access not confirmed for the organizer account.' if http else
                str(error) if isinstance(error, ValueError) else type(error).__name__)
            report = []
        message = re.sub(r'hf_[A-Za-z0-9]{20,}', '[redacted]', message)
        pending.append(dict(evaluation_id=job['evaluation_id'], context_json=job['hf_sources_context'], status=status, report=report, message=message))
        events.append({'evaluation_id':job['evaluation_id'], 'state':'checkpoint_source_' + status})
    for offset in range(0,len(pending),20):
        api(settings['api_url'], settings['organizer_email'], token, 'reviewer_checkpoint_sources_batch', checks=pending[offset:offset+20])
    return {'latest_requests':len(queue['jobs']), 'events':events}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', type=Path, required=True)
    parser.add_argument('--private-root', type=Path, required=True)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, str(args.private_root.resolve() / 'tools'))
    original = importlib.import_module('watch_queue')
    os.umask(0o077)
    state_file = args.settings.parent / 'preparation-maintenance-state.json'
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    while True:
        settings = json.loads(args.settings.read_text())
        try:
            maintenance = maintain(settings, state)
        except Exception as error:
            maintenance = {'state':'maintenance_retry', 'error_type':type(error).__name__}
        state_file.write_text(json.dumps(state)); state_file.chmod(0o600)
        try:
            result = original.tick(settings)
        except Exception as error:
            result = {'state':'waiting_retry', 'error_type':type(error).__name__}
        try:
            from process_queue import api
            token = Path(settings['organizer_token_file']).read_text().strip()
            queue = api(settings['api_url'], settings['organizer_email'], token, 'reviewer_preparation_queue')
            audit = audit_deadlines(queue['jobs'])
            audit_path = Path(settings['status_file']).with_name('deadline-audit.json')
            audit_temporary = audit_path.with_suffix('.tmp')
            audit_temporary.write_text(json.dumps(audit)); audit_temporary.chmod(0o600); audit_temporary.replace(audit_path)
            result['deadline_audit'] = audit['counts']
        except Exception as error:
            result['deadline_audit'] = {'state':'audit_retry', 'error_type':type(error).__name__}
        result.update(maintenance=maintenance, checked_at=datetime.now(timezone.utc).isoformat())
        path = Path(settings['status_file']); temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(result)); temporary.chmod(0o600); temporary.replace(path)
        print(json.dumps({'state':result['state'], 'maintenance':maintenance, 'checked_at':result['checked_at']}),flush=True)
        if args.once:
            return
        time.sleep(max(60,int(settings.get('interval_seconds',120))))


if __name__ == '__main__':
    main()
