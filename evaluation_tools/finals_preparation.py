"""Publish immutable finals bundles without executing participant code."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def git(repository, *args, env=None):
    return subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', '-C', str(repository), *args],
        env=env, check=True, capture_output=True, timeout=600).stdout


def publish_bundle(repository, source, submission, request_id, remote, base_sha):
    from rsc_real.compose import compose_branch
    if not re.fullmatch(r'real_[A-Za-z0-9_]{1,80}', request_id):
        raise ValueError('Invalid request ID')
    if not re.fullmatch('[a-f0-9]{40}', base_sha):
        raise ValueError('Pin the official base commit')
    ref = 'refs/heads/' + request_id
    lookup = subprocess.run(['git', '-C', str(repository), 'ls-remote', remote, ref],
        check=True, capture_output=True, timeout=120).stdout.decode().splitlines()
    if lookup:
        if len(lookup) != 1 or lookup[0].split()[1] != ref:
            raise ValueError('Unexpected remote branch lookup')
        sha = lookup[0].split()[0]
        git(repository, 'fetch', '--no-tags', remote, ref)
        if git(repository, 'rev-parse', 'FETCH_HEAD').decode().strip() != sha:
            raise ValueError('Remote branch changed during lookup')
        provenance = json.loads(git(repository, 'show', sha + ':policy-provenance.json'))
        if provenance['submission'] != submission:
            raise ValueError('Existing remote branch has different submitted versions')
        git(repository, 'merge-base', '--is-ancestor', base_sha, sha)
    else:
        sha = compose_branch(repository, source, submission, request_id, base=base_sha)
        # A newly appeared conflicting branch must never be overwritten.
        git(repository, 'push', '--force-with-lease=' + ref + ':', remote, sha + ':' + ref)
    final = git(repository, 'ls-remote', remote, ref).decode().split()
    if final != [sha, ref]:
        raise ValueError('Published branch identity mismatch')
    raw = git(repository, 'show', sha + ':policy-provenance.json')
    return {'bundle_sha':sha, 'manifest_sha256':hashlib.sha256(raw).hexdigest()}


def prepare_remote(job, submission, settings, private_tools):
    repository = Path(settings['real_repository']).resolve()
    sys.path.insert(0, str(repository))
    token_file = Path(settings['participant_token_file']).resolve()
    if token_file.stat().st_mode & 0o077:
        raise ValueError('Participant Git credential must be private')
    environment = {**os.environ, 'GIT_TERMINAL_PROMPT':'0',
        'GIT_ASKPASS':str(private_tools / 'git_askpass.py'), 'RSC_PARTICIPANT_TOKEN_FILE':str(token_file)}
    with tempfile.TemporaryDirectory(prefix='rsc-real-source-') as temporary:
        source = Path(temporary) / 'source.git'
        git(temporary, 'init', '--bare', str(source))
        git(source, '-c', 'credential.helper=', 'fetch', '--depth=1', '--no-tags',
            submission['repository'], submission['commit'], env=environment)
        if git(source, 'rev-parse', 'FETCH_HEAD').decode().strip() != submission['commit']:
            raise ValueError('Fetched participant commit mismatch')
        return publish_bundle(repository, source, submission, job['request_id'],
            settings['real_remote'], settings['real_base_sha'])


def prepare_queue(queue, freeze_results, call, prepare, now, retries):
    jobs = {job['request_id']:job for job in queue['requests']}
    results = []
    for frozen in freeze_results:
        if frozen['status'] != 'versions_frozen':
            results.append(frozen)
            continue
        identifier = frozen['request_id']
        job = jobs[identifier]
        if (job.get('preparation') or {}).get('status') == 'prepared':
            results.append({'request_id':identifier, 'status':'prepared',
                            'bundle_sha':job['preparation']['bundle_sha']})
            continue
        if retries.get(identifier, {}).get('next_at', 0) > now:
            results.append({'request_id':identifier, 'status':'preparation_backoff'})
            continue
        try:
            report = prepare(job, frozen['submission'])
            call('finals_admin_prepare_result', request_id=identifier, status='prepared',
                 version_fingerprint=frozen['submission']['version_fingerprint'],
                 note='Pinned policy tree composed and branch published; runtime validation is separate.', **report)
            retries.pop(identifier, None)
            results.append({'request_id':identifier, 'status':'prepared', **report})
        except Exception as error:
            attempts = retries.get(identifier, {}).get('attempts', 0) + 1
            retries[identifier] = {'attempts':attempts, 'next_at':now + min(1800, 30 * 2 ** min(attempts, 6))}
            results.append({'request_id':identifier, 'status':'preparation_retry', 'error_type':type(error).__name__})
    return results
