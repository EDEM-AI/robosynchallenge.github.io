import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'robosynchallenge_real'))
from rsc_real.schedule import TASKS
from finals_preparation import git, prepare_queue, publish_bundle


class PreparationTests(unittest.TestCase):
    def test_git_publish_retry_conflict_and_no_participant_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, repository, remote = (root / name for name in ('source', 'official', 'remote.git'))
            for target in (source, repository):
                target.mkdir()
                git(target, 'init', '-b', 'main')
                git(target, 'config', 'user.name', 'Fixture')
                git(target, 'config', 'user.email', 'fixture@example.test')
            git(root, 'init', '--bare', str(remote))
            policy = source / 'policy' / 'fixture'
            policy.mkdir(parents=True)
            for name in ('eval.sh', 'deploy_policy.yml', 'deploy_policy.py'):
                (policy / name).write_text('DO NOT EXECUTE: fixture\n')
            git(source, 'add', '.')
            git(source, 'commit', '-m', 'Participant fixture')
            commit = git(source, 'rev-parse', 'HEAD').decode().strip()
            git(repository, 'commit', '--allow-empty', '-m', 'Official fixture')
            base = git(repository, 'rev-parse', 'HEAD').decode().strip()
            submission = {'repository':'https://github.com/example/source', 'commit':commit,
                          'tasks':[{'task':task, 'policy_path':'policy/fixture'} for task in TASKS]}
            receipt = publish_bundle(repository, source, submission, 'real_fixture', str(remote), base)
            self.assertEqual(len(receipt['bundle_sha']), 40)
            self.assertEqual(len(receipt['manifest_sha256']), 64)
            git(repository, 'branch', '-D', 'real_fixture')
            self.assertEqual(publish_bundle(repository, source, submission, 'real_fixture', str(remote), base), receipt)
            with self.assertRaisesRegex(ValueError, 'different submitted'):
                publish_bundle(repository, source, {**submission, 'changed':True}, 'real_fixture', str(remote), base)
            self.assertEqual(git(repository, 'rev-parse', 'main').decode().strip(), base)
            self.assertFalse((repository / 'policy').exists())

    def test_lost_backend_receipt_and_backoff(self):
        queue = {'requests':[{'request_id':'real_fixture'}]}
        frozen = [{'request_id':'real_fixture','status':'versions_frozen','submission':{'version_fingerprint':'a'*64}}]
        retries = {}
        prepared = []
        def prepare(job, submission):
            prepared.append(job['request_id'])
            return {'bundle_sha':'b'*40,'manifest_sha256':'c'*64}
        def lost(*args, **kwargs):
            raise TimeoutError('Response lost')
        result = prepare_queue(queue, frozen, lost, prepare, 100, retries)
        self.assertEqual(result[0]['status'], 'preparation_retry')
        self.assertEqual(prepare_queue(queue, frozen, lost, prepare, 101, retries)[0]['status'], 'preparation_backoff')
        self.assertEqual(len(prepared), 1)
        calls = []
        result = prepare_queue(queue, frozen, lambda action, **fields:calls.append(fields), prepare, 10000, retries)
        self.assertEqual(result[0]['status'], 'prepared')
        self.assertEqual(calls[0]['version_fingerprint'], 'a'*64)
        self.assertEqual(retries, {})
        queue['requests'][0]['preparation'] = {'status':'prepared','bundle_sha':'b'*40}
        prepare_queue(queue, frozen, lost, prepare, 20000, retries)
        self.assertEqual(len(prepared), 2)


if __name__ == '__main__':
    unittest.main()
