"""Private deployment snapshots and authenticated finals administration."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import subprocess

import requests


def private_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as stream:
        json.dump(value, stream, indent=2)


def snapshot(source, output):
    credentials = json.loads((Path.home() / '.clasprc.json').read_text())['tokens']['default']
    session = requests.Session()
    session.trust_env = False
    session.proxies = {'https':'http://127.0.0.1:7897'}
    response = session.post('https://oauth2.googleapis.com/token', data={
        'grant_type':'refresh_token', **{key:credentials[key] for key in ('client_id','client_secret','refresh_token')}}, timeout=45)
    response.raise_for_status()
    session.headers['Authorization'] = 'Bearer ' + response.json()['access_token']
    project = json.loads((source / '.clasp.json').read_text())['scriptId']
    response = session.get('https://script.googleapis.com/v1/projects/' + project + '/content', timeout=90)
    response.raise_for_status()
    content = response.json()
    private_json(output, content)
    print(json.dumps({'snapshot':str(output), 'files':[{ 'name':item['name'],
        'sha256':hashlib.sha256(item['source'].encode()).hexdigest()} for item in content['files']
        if item['name'] in ('Code','Finals','PaperSubmissions','appsscript')]}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['snapshot','call','worker-settings'])
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[1] / 'apps-script')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--settings', type=Path)
    parser.add_argument('--private-tools', type=Path)
    parser.add_argument('--payload', type=Path)
    parser.add_argument('--real-repository', type=Path)
    options = parser.parse_args()
    if options.operation == 'snapshot':
        snapshot(options.source, options.output)
        return
    if options.operation == 'worker-settings':
        if not options.settings or not options.real_repository:
            parser.error('worker-settings requires settings and real-repository')
        existing = json.loads(options.settings.read_text())
        settings = {key:existing[key] for key in ('api_url','organizer_email','organizer_token_file','participant_token_file')}
        if existing.get('hf_token_file'):
            settings['hf_token_file'] = existing['hf_token_file']
        settings.update(state_dir=str(options.output.parent / 'finals-preparation'),
            real_repository=str(options.real_repository.resolve()),
            real_remote='https://github.com/ZhaoRunyi/robosynchallenge_real.git',
            real_base_sha=subprocess.check_output(['git','-C',str(options.real_repository),'rev-parse','main'], text=True).strip())
        private_json(options.output, settings)
        print(json.dumps({'settings':str(options.output), 'base_sha':settings['real_base_sha']}))
        return
    if not all((options.settings, options.private_tools, options.payload)):
        parser.error('call requires settings, private-tools and payload')
    sys.path.insert(0, str(options.private_tools.resolve()))
    from process_queue import api
    settings = json.loads(options.settings.read_text())
    payload = json.loads(options.payload.read_text())
    action = payload.pop('action')
    if not action.startswith(('finals_admin_', 'paper_admin_')):
        raise ValueError('Only finals/paper administration is allowed')
    result = api(settings['api_url'], settings['organizer_email'],
        Path(settings['organizer_token_file']).read_text().strip(), action, **payload)
    private_json(options.output, result)
    print(json.dumps({'action':action, 'ok':result.get('ok'), 'receipt':str(options.output)}))


if __name__ == '__main__':
    main()
