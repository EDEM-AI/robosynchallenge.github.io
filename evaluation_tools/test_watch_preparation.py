import unittest
from watch_preparation import transient, source_urls, audit_deadlines


class MaintenanceTests(unittest.TestCase):
    def test_only_organizer_failures_retry_automatically(self):
        for value in ('SSL: UNEXPECTED_EOF_WHILE_READING', '锁超时：另一个进程占用锁时间过久', "Command '['git', 'push', 'origin']' failed", 'HTTP 503', 'ReadTimeout'):
            self.assertTrue(transient(value))
        for value in ('Submitted commit has no policy/ tree', 'Adapter requires deploy_policy.yml', 'HTTP 403', 'HTTP 404', 'Submitted GitHub tree branch cannot be resolved'):
            self.assertFalse(transient(value))

    def test_source_links_do_not_create_task_mappings(self):
        self.assertEqual(source_urls('https://huggingface.co/a/b; https://huggingface.co/c/d'), ['https://huggingface.co/a/b','https://huggingface.co/c/d'])
        self.assertEqual(source_urls('a/b'), ['a/b'])
        with self.assertRaises(ValueError):
            source_urls('')

    def test_deadline_audit_distinguishes_pending_and_frozen_versions(self):
        from datetime import datetime
        cutoff = '2026-10-12T12:00:00Z'
        boundary = datetime.fromisoformat(cutoff.replace('Z', '+00:00')).timestamp()
        code = {'revision':'a'*40, 'cutoff_at':cutoff, 'authored_at':'2026-10-12T11:59:59Z', 'committed_at':'2026-10-12T11:59:59Z'}
        links = {str(index):'https://huggingface.co/team/model' for index in range(10)}
        hf = {task:{'revision':'b'*40, 'accessible':True, 'url':url, 'cutoff_at':cutoff,
            'files_checked':1, 'committed_at':'2026-10-12T11:59:59Z'} for task,url in links.items()}
        job = {'evaluation_id':'eval_test', 'version_cutoff_at':cutoff, 'bundle_commit':'c'*40,
            'code_participant_commit':'a'*40, 'code_bundle_commit':'c'*40,
            'version_status':'final', 'version_report':{'code':code, 'hf':hf}, 'task_checkpoint_links':links}
        def state():
            return audit_deadlines([job], boundary)['requests'][0]['state']
        self.assertEqual(audit_deadlines([job], boundary-1)['requests'][0]['state'], 'awaiting_cutoff')
        self.assertEqual(state(), 'frozen')
        job['code_participant_commit'] = 'd'*40
        self.assertEqual(state(), 'invalid_final_receipt')
        job['code_participant_commit'] = 'a'*40
        code['committed_at'] = cutoff
        self.assertEqual(state(), 'invalid_final_receipt')
        code['committed_at'] = '2026-10-12T11:59:59Z'
        hf['0']['committed_at'] = cutoff
        self.assertEqual(state(), 'invalid_final_receipt')
        job['version_status'] = 'provisional'
        self.assertEqual(state(), 'awaiting_final_preparation')
        job['hf_check_status'] = 'failed'
        self.assertEqual(state(), 'blocked')

    def test_legacy_mapping_never_counts_as_fully_frozen(self):
        job = {'evaluation_id':'eval_legacy', 'version_cutoff_at':'2026-10-12T12:00:00Z',
            'coverage_status':'legacy_unverified', 'code_selection':{'revision':'a'*40,
            'cutoff_at':'2026-10-12T12:00:00Z', 'authored_at':'2026-10-12T11:59:59Z', 'committed_at':'2026-10-12T11:59:59Z'}}
        from datetime import datetime
        stamp = datetime.fromisoformat('2026-10-12T12:00:00+00:00').timestamp()
        self.assertEqual(audit_deadlines([job], stamp)['requests'][0]['state'], 'code_frozen_awaiting_task_mapping')


if __name__ == '__main__':
    unittest.main()
