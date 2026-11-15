"""Compose explicitly provisional bundles; never create final version receipts."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time

from finals_version_freeze import private_json, resolve_remote
from finals_preparation import prepare_remote


def preview_job(job, now):
    from version_selection import cutoff_seconds
    if job.get('is_test') or job['submission'].get('version_policy') != 'latest_before_deadline':
        raise ValueError('Only official deadline-selected requests may be previewed')
    if now >= cutoff_seconds(job['submission']['version_cutoff_at']):
        raise ValueError('Use final freezing after the deadline')
    snapshot = json.loads(json.dumps(job))
    snapshot['submission']['version_cutoff_at'] = datetime.fromtimestamp(now, timezone.utc).isoformat()
    return snapshot


def preview_submission(job, report, base_sha):
    submission = json.loads(json.dumps(job['submission']))
    if report['code']['repo'] != submission['repository']:
        raise ValueError('Preview source mismatch')
    submission['commit'] = report['code']['revision']
    selected = {v['id']: v for v in report['checkpoints']}
    if set(selected) != {s['id'] for s in submission['checkpoints']}:
        raise ValueError('Preview checkpoint mapping mismatch')
    for source in submission['checkpoints']:
        version = selected[source['id']]
        if any(source[key] != version[key] for key in ('repo', 'ref', 'path')):
            raise ValueError('Preview checkpoint source mismatch')
        source['revision'] = version['revision']
        if version.get('unresolved'):
            source['unresolved'] = version['unresolved']
    submission.update(preparation_kind='preview', source_request_id=job['request_id'])
    identity = hashlib.sha256(json.dumps({'submission': submission, 'base_sha': base_sha},
        sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return submission, job['request_id'] + '_preview_' + identity[:16]


def prepare_preview(job, settings, private_tools, now=None, report_progress=lambda **fields: None):
    now = time.time() if now is None else now
    snapshot = preview_job(job, now)
    report_progress(state='resolving_preview')
    report = resolve_remote(snapshot, settings, private_tools, allow_unresolved=True)
    submission, branch = preview_submission(job, report, settings['real_base_sha'])
    report_progress(state='composing_preview', branch=branch, source_sha=submission['commit'])
    result = prepare_remote({**job, 'request_id': branch}, submission, settings, private_tools)
    unresolved = [v for v in report['checkpoints'] if v.get('unresolved')]
    return {**result, 'request_id': job['request_id'], 'fingerprint': job['fingerprint'],
            'status': 'preview_code_ready' if unresolved else 'preview_ready',
            'unresolved_checkpoints':len(unresolved), 'branch': branch, 'source_sha': submission['commit'],
            'checked_at': datetime.fromtimestamp(now, timezone.utc).isoformat(),
            'version_cutoff_at': job['submission']['version_cutoff_at'], 'versions': report}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', required=True, type=Path)
    parser.add_argument('--private-tools', required=True, type=Path)
    parser.add_argument('--request-id', required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.private_tools.resolve()))
    from process_queue import api
    settings = json.loads(args.settings.read_text())
    token = Path(settings['organizer_token_file']).read_text().strip()
    queue = api(settings['api_url'], settings['organizer_email'], token, 'finals_admin_queue')
    job = next(j for j in queue['requests'] if j['request_id'] == args.request_id)
    result = prepare_preview(job, settings, args.private_tools.resolve(),
        report_progress=lambda **fields: print(json.dumps(fields), flush=True))
    private_json(Path(settings['state_dir']) / (args.request_id + '-preview.json'), result)
    print(json.dumps({k:v for k,v in result.items() if k != 'versions'}), flush=True)


if __name__ == '__main__':
    main()
