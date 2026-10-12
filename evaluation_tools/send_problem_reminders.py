"""Send organizer-requested issue reminders through the existing reviewer backend."""
import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import sys


def problems(job):
    result = []
    if job.get('preparation_status') == 'failed':
        result.append(('code', job.get('preparation_error') or 'Code preparation failed.'))
    if job.get('hf_check_status') == 'failed':
        result.append(('checkpoint', job.get('hf_check_error') or 'Checkpoint access was not confirmed.'))
    source = job.get('hf_sources') or {}
    if source.get('status') == 'failed':
        result.append(('checkpoint', source.get('message') or 'Checkpoint source access was not confirmed.'))
    return result


def message(job, deadline):
    issues = problems(job)
    details = '\n'.join('ERROR: ' + value for _, value in issues)
    instructions = []
    if any(kind == 'code' for kind, _ in issues):
        instructions.append('Provide an accessible GitHub repository and a full immutable commit URL. The submitted commit must contain the complete policy/ tree, including your adapter, dependencies, eval.sh, deploy_policy.py and deploy_policy.yml. Only policy/ is retained; the environment comes from the official evaluation code. For a private GitHub repository, grant the individual robosynchallenge account access and confirm the submitted revision exists.')
    if any(kind == 'checkpoint' for kind, _ in issues):
        instructions.append('Provide a concrete Hugging Face checkpoint URL (or account/repository), including any required revision, file or subdirectory, for each of the 10 tasks. An account/organization homepage is not a checkpoint. For restricted access, use a visible gated model and grant the individual RoboSynChallenge user access to the actual model files. Private HF repository invitations and participant access tokens are not supported. HTTP 404 does not distinguish a wrong URL/revision/file from insufficient access; verify both.')
    cutoff = datetime.fromisoformat(deadline.replace('Z', '+00:00'))
    beijing = cutoff.astimezone(timezone(timedelta(hours=8))).strftime('%B %d, %Y at %H:%M')
    body = (f'Dear {job["team_name"]} team,\n\n'
        f'Your current RoboSynChallenge evaluation request ({job["evaluation_id"]}) is still blocked by the following preparation check:\n\n'
        f'{details}\n\nSubmitted code: {job["code_link"]}\n\n' + '\n\n'.join(instructions) +
        f'\n\nPlease submit your corrected links using the orange button below BEFORE {beijing} Beijing time (UTC+8), equivalent to {cutoff.strftime("%Y-%m-%d %H:%M")} UTC. This is the deadline for this reminder\'s response form.\n\n'
        'For a correction, the form requires a full 40-character GitHub commit URL and checkpoint links for all 10 tasks. If only checkpoint access/links changed, keep your code unchanged and provide its existing immutable commit URL. Multiple tasks may share a documented checkpoint.\n\n'
        'Do not create a new evaluation request solely to answer this notice. Use this email\'s form; an older response link may have been superseded. After your response, the system reruns preparation/access checks and notifies the evaluator through the existing workflow. If you believe the check is incorrect, select confirmation and provide supporting details in the notes, or reply to this email.\n\n'
        'Best regards,\nRoboSynChallenge Organizing Team')
    return f'RoboSynChallenge evaluation reminder - {job["evaluation_id"]}', body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', type=Path, required=True)
    parser.add_argument('--private-root', type=Path, required=True)
    parser.add_argument('--deadline', required=True, help='Explicit UTC ISO timestamp, ending in Z')
    parser.add_argument('--batch', type=Path, required=True, help='Private persistent delivery receipt; reuse it for retries')
    parser.add_argument('--retry-unrecorded', action='store_true', help='Retry failed calls only when their message ID has no backend delivery record')
    args = parser.parse_args()
    deadline = datetime.fromisoformat(args.deadline.replace('Z', '+00:00'))
    if not args.deadline.endswith('Z') or deadline <= datetime.now(timezone.utc):
        parser.error('The response deadline must be a future UTC timestamp')
    sys.path.insert(0, str(args.private_root.resolve() / 'tools'))
    from process_queue import api
    os.umask(0o077)
    settings = json.loads(args.settings.read_text())
    token = Path(settings['organizer_token_file']).read_text().strip()
    def request(action, **fields):
        return api(settings['api_url'], settings['organizer_email'], token, action, **fields)
    def save():
        args.batch.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = args.batch.with_suffix('.tmp')
        temporary.write_text(json.dumps(batch)); temporary.chmod(0o600); temporary.replace(args.batch)
    if args.batch.exists():
        batch = json.loads(args.batch.read_text())
        if batch['deadline'] != args.deadline:
            raise ValueError('Do not change the deadline of a saved reminder batch')
    else:
        jobs = request('reviewer_preparation_queue')['jobs']
        batch = {'deadline':args.deadline, 'created_at':datetime.now(timezone.utc).isoformat(),
            'targets':[{ 'participant_email':job['email'], 'team_name':job['team_name'], 'status':'pending'} for job in jobs if problems(job)]}
        save()
    if args.retry_unrecorded:
        messages = {row['message_id']:row for row in request('reviewer_mail_status')['messages']}
        for target in batch['targets']:
            if target['status'] != 'needs_delivery_verification':
                continue
            saved = messages.get(target.get('message_id'))
            if not saved:
                target['status'] = 'pending'
            elif saved.get('status') == 'sent':
                target['status'] = 'sent'
        save()
    for target in batch['targets']:
        if target['status'] != 'pending':
            continue
        jobs = request('reviewer_preparation_queue')['jobs']
        job = next((job for job in jobs if job['email'] == target['participant_email']), None)
        if not job or not problems(job):
            target['status'] = 'skipped_resolved'; save()
            print(json.dumps({'team':target['team_name'],'status':target['status']}),flush=True)
            continue
        identity = batch['created_at'] + args.deadline + job['evaluation_id']
        message_id = 'msg_' + hashlib.sha256(identity.encode()).hexdigest()[:32]
        subject, body = message(job,args.deadline)
        # Persist the exact request before sending. Uncertain delivery is never
        # retried with a new ID; the backend owns idempotence and verification.
        target.update(evaluation_id=job['evaluation_id'],message_id=message_id,subject=subject)
        save()
        try:
            result = request('reviewer_send_issue',evaluation_id=job['evaluation_id'],message_id=message_id,
                stage=0,subject=subject,body=body,response_deadline_at=args.deadline)
            target.update(status=result['status'], response_deadline_at=result.get('response_deadline_at',''), duplicate=bool(result.get('duplicate')))
        except Exception as error:
            target.update(status='needs_delivery_verification',error_type=type(error).__name__,error_message=str(error).replace(token,'[redacted]')[:300])
        save()
        print(json.dumps({'team':target['team_name'],'evaluation_id':target['evaluation_id'],'status':target['status']}),flush=True)
    print(json.dumps({'targets':len(batch['targets']), 'sent':sum(t['status']=='sent' for t in batch['targets']),
        'skipped':sum(t['status']=='skipped_resolved' for t in batch['targets']),
        'needs_verification':sum(t['status']=='needs_delivery_verification' for t in batch['targets'])}),flush=True)


if __name__ == '__main__':
    main()
