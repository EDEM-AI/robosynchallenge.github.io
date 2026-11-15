import copy
from pathlib import Path
import sys
import unittest
import tempfile
from unittest.mock import Mock
from finals_preparation_status import preview_queue, error_note

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'robosynchallenge_heldout_private/tools'))
from finals_preview import preview_job, preview_submission
from version_selection import cutoff_seconds


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.job = {'request_id': 'real_fixture', 'submission': {
            'repository': 'https://github.com/example/policy', 'version_policy': 'latest_before_deadline',
            'version_cutoff_at': '2026-11-16T12:00:00Z',
            'checkpoints': [{'id': 'w', 'repo': 'example/weights', 'ref': 'main', 'path': ''}]}}
        self.report = {'code': {'repo': self.job['submission']['repository'], 'revision': 'a'*40},
                       'checkpoints': [{**self.job['submission']['checkpoints'][0], 'revision': 'b'*40}]}

    def test_preview_never_changes_deadline_or_freezes(self):
        original = copy.deepcopy(self.job)
        cutoff = cutoff_seconds(self.job['submission']['version_cutoff_at'])
        self.assertNotEqual(preview_job(self.job, cutoff-60)['submission']['version_cutoff_at'], original['submission']['version_cutoff_at'])
        submission, branch = preview_submission(self.job, self.report, 'c'*40)
        self.assertEqual(self.job, original)
        self.assertEqual(submission['version_cutoff_at'], original['submission']['version_cutoff_at'])
        self.assertEqual(submission['preparation_kind'], 'preview')
        self.assertNotIn('version_fingerprint', submission)
        self.assertTrue(branch.startswith('real_fixture_preview_'))
        with self.assertRaisesRegex(ValueError, 'final freezing'):
            preview_job(self.job, cutoff)

    def test_identity_changes_only_with_sources_or_base(self):
        first = preview_submission(self.job, self.report, 'c'*40)[1]
        self.report['cutoff_at'] = 'different scan time'
        self.assertEqual(first, preview_submission(self.job, self.report, 'c'*40)[1])
        self.assertNotEqual(first, preview_submission(self.job, self.report, 'd'*40)[1])
        self.report['checkpoints'][0]['revision'] = 'e'*40
        self.assertNotEqual(first, preview_submission(self.job, self.report, 'c'*40)[1])

    def test_missing_weight_is_explicit_not_fabricated(self):
        self.report['checkpoints'][0].update(revision=None,unresolved={'error_type':'PermissionError'})
        submission, _ = preview_submission(self.job,self.report,'c'*40)
        self.assertIsNone(submission['checkpoints'][0]['revision'])
        self.assertIn('unresolved',submission['checkpoints'][0])

    def test_queue_cache_retry_and_deadline(self):
        from datetime import datetime, timezone
        self.job['fingerprint']='fingerprint'
        now=cutoff_seconds(self.job['submission']['version_cutoff_at'])-1200
        receipt={'request_id':self.job['request_id'],'fingerprint':'fingerprint','status':'preview_ready',
            'checked_at':datetime.fromtimestamp(now,timezone.utc).isoformat(),'branch':'real_fixture_preview_abc',
            'bundle_sha':'a'*40,'source_sha':'b'*40,'manifest_sha256':'c'*64}
        call=Mock();prepare=Mock(return_value=receipt);retries={};queue={'requests':[self.job]}
        with tempfile.TemporaryDirectory() as directory:
            state=Path(directory)
            preview_queue(queue,call,prepare,state,now,retries)
            self.assertEqual(call.call_args.kwargs['body']['request_id'],'real_fixture')
            preview_queue(queue,call,prepare,state,now+60,retries)
            self.assertEqual(prepare.call_count,1)
            prepare.side_effect=TimeoutError('secret-token')
            result=preview_queue(queue,call,prepare,state,now+301,retries)
            self.assertEqual(result[0]['status'],'preview_retry')
            self.assertNotIn('secret-token',str(call.call_args))
            self.assertTrue((state/'real_fixture-preview.json').exists())
            preview_queue(queue,call,prepare,state,now+302,retries)
            self.assertEqual(prepare.call_count,2)
            self.assertEqual(preview_queue(queue,call,prepare,state,now+1200,retries),[])
            self.assertEqual(prepare.call_count,2)
            self.job['fingerprint']='new'
            preview_queue(queue,call,prepare,state,now+303,retries)
            self.assertEqual(prepare.call_count,3)

    def test_errors_never_expose_credentials(self):
        import subprocess
        error=subprocess.CalledProcessError(128,['git','https://secret@host'],stderr=b'fatal secret')
        self.assertNotIn('secret',error_note(error))


if __name__ == '__main__':
    unittest.main()
