"""Resolve finals sources after the deadline; never execute participant code.

Uses the same Git/HF cutoff selectors as preliminary preparation. Cloud writes
are limited to the finals version receipt. No model weights are downloaded.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time


def validate_job(job, now):
    from version_selection import cutoff_seconds
    submission = job['submission']
    if not re.fullmatch(r'real_[A-Za-z0-9_]{1,80}', job['request_id']):
        raise ValueError('Invalid finals request ID')
    if job.get('is_test') or submission.get('version_policy') != 'latest_before_deadline':
        raise ValueError('Formal deadline-selected submission required')
    if now < cutoff_seconds(submission['version_cutoff_at']):
        raise ValueError('Wait until the version cutoff')
    if not re.fullmatch(r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', submission['repository']):
        raise ValueError('Only GitHub source repositories are supported')
    return submission


def resolve_from_checkout(job, checkout, code_branch, hf_api, hf_token, now):
    from version_selection import select_git, select_hf
    submission = validate_job(job, now)
    if submission.get('code_ref') and submission['code_ref'] != code_branch:
        raise ValueError('Code branch mismatch')
    cutoff = submission['version_cutoff_at']
    code = select_git(checkout, 'refs/heads/' + code_branch, cutoff)
    code.update(repo=submission['repository'], ref=code_branch)
    cache, checkpoints = {}, []
    for source in submission['checkpoints']:
        key = (source['repo'], source['ref'])
        if key not in cache:
            history = hf_api.list_repo_commits(source['repo'], revision=source['ref'], token=hf_token)
            sha, committed = select_hf(history, cutoff)
            info = hf_api.model_info(source['repo'], revision=sha, token=hf_token)
            if info.sha != sha:
                raise ValueError('HF metadata version mismatch')
            cache[key] = sha, committed, [item.rfilename for item in info.siblings]
        sha, committed, files = cache[key]
        prefix = source['path']
        if not any(not prefix or name == prefix or name.startswith(prefix + '/') for name in files):
            raise ValueError('Checkpoint path is absent at the selected revision')
        checkpoints.append({**source, 'revision':sha, 'committed_at':committed})
    return {'cutoff_at':cutoff, 'code':code, 'checkpoints':checkpoints}


def resolve_remote(job, settings, private_tools):
    from hf_access import read_token
    from huggingface_hub import HfApi
    submission = validate_job(job, time.time())
    token_path = Path(settings['participant_token_file']).resolve()
    if not token_path.is_file() or token_path.stat().st_mode & 0o077:
        raise ValueError('GitHub read credential must be a private file')
    environment = {**os.environ, 'GIT_TERMINAL_PROMPT':'0',
        'GIT_ASKPASS':str(private_tools / 'git_askpass.py'),
        'RSC_PARTICIPANT_TOKEN_FILE':str(token_path)}
    with tempfile.TemporaryDirectory(prefix='rsc-finals-freeze-') as directory:
        checkout = Path(directory) / 'source.git'
        command = ['git', '-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=',
            'clone', '--bare', '--filter=blob:none', '--no-tags', '--single-branch']
        if submission.get('code_ref'):
            command += ['--branch', submission['code_ref']]
        command += ['--', submission['repository'], str(checkout)]
        subprocess.run(command, env=environment, capture_output=True, check=True, timeout=600)
        branch = subprocess.run(['git', '-C', str(checkout), 'symbolic-ref', '--short', 'HEAD'],
            capture_output=True, text=True, check=True, timeout=30).stdout.strip()
        return resolve_from_checkout(job, checkout, branch,
            HfApi(endpoint='https://huggingface.co'), read_token(settings.get('hf_token_file')), time.time())


def resolved_submission(job, receipt):
    """Only backend-confirmed receipts can be exported for the code composer."""
    raw = receipt['version_json']
    if hashlib.sha256(raw.encode()).hexdigest() != receipt['fingerprint'] or receipt['request_id'] != job['request_id']:
        raise ValueError('Frozen version receipt mismatch')
    report = json.loads(raw)
    submission = json.loads(json.dumps(job['submission']))
    if report['cutoff_at'] != submission['version_cutoff_at'] or report['code']['repo'] != submission['repository']:
        raise ValueError('Frozen version source mismatch')
    submission['commit'] = report['code']['revision']
    selected = {row['id']:row for row in report['checkpoints']}
    for source in submission['checkpoints']:
        version = selected[source['id']]
        if any(source[key] != version[key] for key in ('repo', 'ref', 'path')):
            raise ValueError('Frozen checkpoint source mismatch')
        source['revision'] = version['revision']
    submission['version_fingerprint'] = receipt['fingerprint']
    return submission


def private_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=path.name + '.')
    try:
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(value, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def process_queue(queue, call, resolver, now, retry_state):
    from version_selection import cutoff_seconds
    results = []
    for job in queue['requests']:
        identifier = job['request_id']
        try:
            if job.get('is_test'):
                continue
            submission = job['submission']
            if submission.get('version_policy') != 'latest_before_deadline':
                results.append({'request_id':identifier, 'status':'legacy_submission_unchanged'})
                continue
            if now < cutoff_seconds(submission['version_cutoff_at']):
                results.append({'request_id':identifier, 'status':'awaiting_deadline'})
                continue
            retry = retry_state.get(identifier, {})
            if not job.get('versions') and retry.get('next_at', 0) > now:
                results.append({'request_id':identifier, 'status':'backoff'})
                continue
            receipt = job.get('versions')
            if not receipt:
                report = resolver(job)
                receipt = call('finals_admin_freeze_versions', request_id=identifier,
                    fingerprint=job['fingerprint'], versions=report)['versions']
            resolved = resolved_submission(job, receipt)
            retry_state.pop(identifier, None)
            results.append({'request_id':identifier, 'status':'versions_frozen', 'submission':resolved})
        except Exception as error:
            attempts = retry_state.get(identifier, {}).get('attempts', 0) + 1
            retry_state[identifier] = {'attempts':attempts, 'next_at':now + min(1800, 30 * 2 ** min(attempts, 6))}
            results.append({'request_id':identifier, 'status':'retry', 'error_type':type(error).__name__})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', type=Path, required=True)
    parser.add_argument('--private-tools', type=Path, required=True)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, str(args.private_tools.resolve()))
    from process_queue import api
    settings = json.loads(args.settings.read_text())
    token = Path(settings['organizer_token_file']).read_text().strip()
    state_dir = Path(settings['state_dir'])
    state_path = state_dir / 'retry-state.json'
    retries = json.loads(state_path.read_text()) if state_path.exists() else {}
    preparation_path = state_dir / 'preparation-retry-state.json'
    preparation_retries = json.loads(preparation_path.read_text()) if preparation_path.exists() else {}
    def call(action, **fields):
        return api(settings['api_url'], settings['organizer_email'], token, action, **fields)
    while True:
        try:
            queue = call('finals_admin_queue')
            results = process_queue(queue, call, lambda job:resolve_remote(job, settings, args.private_tools.resolve()), time.time(), retries)
            for result in results:
                if 'submission' in result:
                    private_json(state_dir / (result['request_id'] + '.json'), result['submission'])
            if settings.get('real_repository'):
                from finals_preparation import prepare_queue, prepare_remote
                results = prepare_queue(queue, results, call,
                    lambda job, submission:prepare_remote(job, submission, settings, args.private_tools.resolve()),
                    time.time(), preparation_retries)
                private_json(preparation_path, preparation_retries)
            for result in results:
                result.pop('submission', None)
            private_json(state_path, retries)
            private_json(state_dir / 'status.json', {'checked_at':time.time(), 'requests':results})
            print(json.dumps({'requests':results}), flush=True)
        except Exception as error:
            print(json.dumps({'status':'queue_retry', 'error_type':type(error).__name__}), flush=True)
            if args.once:
                raise SystemExit(1)
        if args.once:
            break
        time.sleep(60)


if __name__ == '__main__':
    main()
