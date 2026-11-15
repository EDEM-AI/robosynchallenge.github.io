"""Credential-free progress receipts shared with authenticated remote reviewers."""
from datetime import datetime, timezone
import subprocess


def iso(seconds):
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat()


def error_note(error):
    code = getattr(getattr(error, 'response', None), 'status_code', None)
    if code in (401, 403, 404):
        return 'Source access failed (HTTP %s). Check the submitted URL and organizer access.' % code
    if isinstance(error, subprocess.CalledProcessError):
        stderr = error.stderr or b''
        if isinstance(stderr, bytes):
            stderr = stderr.decode(errors='replace')
        if 'Repository not found' in stderr:
            return 'GitHub repository unavailable. Check its URL and invitation to robosynchallenge.'
        return 'Git command failed (exit %s). Organizer diagnostic required.' % error.returncode
    if isinstance(error, (TimeoutError, subprocess.TimeoutExpired)):
        return 'Source operation timed out; an automatic retry is scheduled.'
    if isinstance(error, ValueError):
        # Do not publish arbitrary exception text, URLs, commands or credentials.
        known = ['Missing public entrypoint:', 'Checkpoint path is absent',
                 'Symlinks and submodules', 'Policy tree too large', 'All ten task mappings']
        for prefix in known:
            if str(error).startswith(prefix):
                return prefix.rstrip(':') + ' Check the submitted policy tree and mapping.'
    return 'Preparation failed; automatic retry is scheduled. Organizer diagnostic required.'


def publish(call, job, status, **fields):
    return call('finals_admin_control_preparation_status', body={
        'request_id':job['request_id'], 'fingerprint':job['fingerprint'], 'status':status, **fields})


def preview_fields(receipt):
    fields = {'preview':{key:receipt[key] for key in
        ('branch', 'bundle_sha', 'source_sha', 'manifest_sha256', 'checked_at')}}
    if receipt.get('unresolved_checkpoints'):
        fields['note'] = 'Code composed; %s checkpoint mappings remain unverified. Not ready for evaluation.' % receipt['unresolved_checkpoints']
        failures = dict.fromkeys(v['repo'] + ': ' + v['unresolved']['error_type'] +
            (' (HTTP %s)' % v['unresolved']['http_status'] if v['unresolved'].get('http_status') else '')
            for v in receipt.get('versions', {}).get('checkpoints', []) if v.get('unresolved'))
        fields['note'] += ' ' + '; '.join(list(failures)[:3])[:700]
    else:
        fields['note'] = 'Provisional code and checkpoint metadata checked. Runtime validation and final deadline freeze are still required.'
    return fields


def preview_queue(queue, call, prepare, state_dir, now, retries, interval=300):
    import json
    from finals_version_freeze import private_json
    from version_selection import cutoff_seconds
    results = []
    for job in queue['requests']:
        submission = job['submission']
        if job.get('is_test') or submission.get('version_policy') != 'latest_before_deadline' or now >= cutoff_seconds(submission['version_cutoff_at']):
            continue
        identifier = job['request_id']
        path = state_dir / (identifier + '-preview.json')
        try:
            retry = retries.get(identifier, {})
            receipt = json.loads(path.read_text()) if path.exists() else None
            failed_at = retry.get('failed_at', retry.get('next_at', 0) - min(1800, 30 * 2 ** min(retry.get('attempts', 0), 6)))
            recovered = receipt and receipt.get('fingerprint') == job['fingerprint'] and datetime.fromisoformat(receipt['checked_at']).timestamp() > failed_at
            if retry.get('fingerprint') == job['fingerprint'] and retry.get('next_at', 0) > now and not recovered:
                publish(call, job, 'preview_retry', attempts=retry['attempts'],
                        next_retry_at=iso(retry['next_at']), error_type=retry['error_type'], note=retry['note'])
                results.append({'request_id':identifier, 'status':'preview_retry'})
                continue
            if not receipt or receipt.get('fingerprint') != job['fingerprint'] or now - datetime.fromisoformat(receipt['checked_at']).timestamp() >= interval:
                def progress(**fields):
                    publish(call, job, fields['state'])
                receipt = prepare(job, progress)
                private_json(path, receipt)
            publish(call, job, receipt['status'], **preview_fields(receipt))
            retries.pop(identifier, None)
            results.append({key:receipt[key] for key in ('request_id', 'status', 'bundle_sha', 'branch')})
        except Exception as error:
            old = retries.get(identifier, {})
            attempts = old.get('attempts', 0) + 1 if old.get('fingerprint') == job['fingerprint'] else 1
            retry = {'fingerprint':job['fingerprint'], 'attempts':attempts, 'failed_at':now,
                     'next_at':now + min(1800, 30 * 2 ** min(attempts, 6)),
                     'error_type':type(error).__name__, 'note':error_note(error)}
            retries[identifier] = retry
            # Retain the last good preview; a late/stale receipt may be rejected by the backend.
            try:
                publish(call, job, 'preview_retry', attempts=attempts, next_retry_at=iso(retry['next_at']),
                        error_type=retry['error_type'], note=retry['note'])
            except Exception:
                pass
            results.append({'request_id':identifier, 'status':'preview_retry', 'error_type':retry['error_type']})
    return results
