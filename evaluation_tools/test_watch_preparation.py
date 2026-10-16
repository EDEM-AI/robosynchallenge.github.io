import unittest
from watch_preparation import transient, source_urls, audit_deadlines, maintain


class MaintenanceTests(unittest.TestCase):
    def test_completed_evaluations_skip_maintenance_without_changing_receipts(self):
        from copy import deepcopy
        import tempfile
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / 'organizer.token'
            token.write_text('synthetic-secret')
            job = {'evaluation_id':'eval_done', 'workflow':{'stages':[{'done':True}]*4+[{'done':False}]},
                   'preparation_error':'HTTP 503', 'hf_check_status':'failed', 'hf_check_error':'ConnectionError'}
            saved = deepcopy(job)
            backend = Mock(return_value={'jobs':[job]})
            modules = {'process_queue':SimpleNamespace(api=backend),
                       'version_selection':SimpleNamespace(cutoff_seconds=Mock())}
            with patch.dict('sys.modules',modules):
                result = maintain({'organizer_token_file':str(token),'api_url':'https://example.test','organizer_email':'admin@example.test'}, {})
            backend.assert_called_once()
            self.assertEqual(result['events'],[{'evaluation_id':'eval_done','state':'completed_snapshot_preserved'}])
            self.assertEqual(job,saved)

    def test_holds_skip_retries_sources_and_all_organizer_mutations(self):
        from copy import deepcopy
        import tempfile
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        for hold in ({'evaluation_blocked':True}, {'adjudication':{'status':'invalid_pending_review'}}):
            for bundle in ('', 'a'*40):
                with self.subTest(hold=hold, bundle=bundle), tempfile.TemporaryDirectory() as directory:
                    token = Path(directory) / 'organizer.token'
                    token.write_text('synthetic-secret')
                    job = {'evaluation_id':'eval_held', 'bundle_commit':bundle,
                        'coverage_status':'legacy_unverified', 'checkpoint_link':'malformed HF URL',
                        'code_link':'malformed GitHub URL', 'version_cutoff_at':'malformed timestamp',
                        'preparation_error':'HTTP 503', 'hf_check_status':'failed',
                        'hf_check_error':'ConnectionError', 'task_checkpoint_links':None,
                        'hf_sources':{'checked_at':'malformed timestamp'}, **hold}
                    original = deepcopy(job)
                    state = {'retries':{'existing':{'attempts':3, 'next_at':500}}}
                    saved = deepcopy(state)
                    backend = Mock(return_value={'jobs':[job]})
                    cutoff = Mock(side_effect=AssertionError('Held cutoff must not be parsed'))
                    modules = {'process_queue':SimpleNamespace(api=backend),
                        'version_selection':SimpleNamespace(cutoff_seconds=cutoff)}
                    with patch.dict('sys.modules', modules), patch('watch_preparation.check_sources') as sources:
                        result = maintain({'organizer_token_file':str(token), 'api_url':'https://example.test',
                            'organizer_email':'owner@example.test'}, state)
                    backend.assert_called_once()
                    self.assertEqual(backend.call_args.args[3], 'reviewer_preparation_queue')
                    sources.assert_not_called()
                    cutoff.assert_not_called()
                    self.assertEqual(result['events'], [{'evaluation_id':'eval_held', 'state':'evaluation_blocked'}])
                    self.assertEqual(state, saved)
                    self.assertEqual(job, original)

    def test_source_batches_exclude_held_ids_and_keep_eligible_checks(self):
        import tempfile
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / 'organizer.token'
            token.write_text('synthetic-secret')
            eligible = [{'evaluation_id':'eval_' + str(index), 'reviewer_email':'reviewer@example.test',
                'coverage_status':'legacy_unverified', 'version_cutoff_at':'2026-10-12T12:00:00Z',
                'checkpoint_link':'https://huggingface.co/team/model', 'hf_sources_context':'context'}
                for index in range(21)]
            held = [{'evaluation_id':'eval_held_flag', 'evaluation_blocked':True},
                    {'evaluation_id':'eval_held_status', 'adjudication':{'status':'invalid_pending_review'}}]
            backend = Mock(return_value={'jobs':eligible[:10] + held + eligible[10:]})
            modules = {'process_queue':SimpleNamespace(api=backend),
                'version_selection':SimpleNamespace(cutoff_seconds=lambda value:0)}
            with patch.dict('sys.modules', modules), patch('watch_preparation.check_sources', return_value=[]) as sources:
                maintain({'organizer_token_file':str(token), 'api_url':'https://example.test',
                    'organizer_email':'owner@example.test'}, {})
            batches = [call.kwargs['checks'] for call in backend.call_args_list
                if call.args[3] == 'reviewer_checkpoint_sources_batch']
            self.assertEqual([len(batch) for batch in batches], [20, 1])
            self.assertEqual([row['evaluation_id'] for batch in batches for row in batch],
                [job['evaluation_id'] for job in eligible])
            self.assertEqual(sources.call_count, 21)
            self.assertEqual([call.args[3] for call in backend.call_args_list],
                ['reviewer_preparation_queue', 'reviewer_checkpoint_sources_batch', 'reviewer_checkpoint_sources_batch'])

    def test_audit_reports_hold_before_ready_missing_mapping_or_bad_cutoff(self):
        for hold in ({'evaluation_blocked':True}, {'adjudication':{'status':'invalid_pending_review'}}):
            for fields in ({}, {'bundle_commit':'a'*40, 'version_status':'final'},
                           {'version_cutoff_at':'malformed cutoff', 'task_checkpoint_links':None}):
                with self.subTest(hold=hold, fields=fields):
                    job = {'evaluation_id':'eval_held', **hold, **fields}
                    result = audit_deadlines([job], 0)
                    self.assertEqual(result['counts'], {'evaluation_blocked':1})
                    self.assertEqual(result['requests'][0]['bundle_commit'], fields.get('bundle_commit', ''))

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
        job['code_version_policy'] = {'mode':'latest_reachable', 'reason':'Organizer approval',
            'approved_by':'admin@example.com', 'approved_at':'2026-10-16T00:00:00Z'}
        code.update(policy='latest_reachable', committed_at='2032-01-01T00:00:00Z')
        self.assertEqual(state(), 'frozen')
        del job['code_version_policy']
        self.assertEqual(state(), 'invalid_final_receipt')
        job['code_version_policy'] = {'mode':'latest_reachable', 'reason':'Organizer approval',
            'approved_by':'admin@example.com', 'approved_at':'2026-10-16T00:00:00Z'}
        hf['0']['committed_at'] = cutoff
        self.assertEqual(state(), 'invalid_final_receipt')
        job['version_status'] = 'provisional'
        self.assertEqual(state(), 'awaiting_final_preparation')
        job['hf_check_status'] = 'failed'
        self.assertEqual(state(), 'blocked')
        job['hf_check_error'] = 'HF check: ConnectionError'
        self.assertEqual(state(), 'organizer_retry')

    def test_legacy_mapping_never_counts_as_fully_frozen(self):
        job = {'evaluation_id':'eval_legacy', 'version_cutoff_at':'2026-10-12T12:00:00Z',
            'coverage_status':'legacy_unverified', 'code_selection':{'revision':'a'*40,
            'cutoff_at':'2026-10-12T12:00:00Z', 'authored_at':'2026-10-12T11:59:59Z', 'committed_at':'2026-10-12T11:59:59Z'}}
        from datetime import datetime
        stamp = datetime.fromisoformat('2026-10-12T12:00:00+00:00').timestamp()
        self.assertEqual(audit_deadlines([job], stamp)['requests'][0]['state'], 'code_frozen_awaiting_task_mapping')

    def test_network_retry_keeps_the_prepared_bundle(self):
        import tempfile
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import Mock, patch
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / 'organizer.token'
            token.write_text('synthetic-secret')
            job = {'evaluation_id':'eval_test', 'bundle_commit':'a'*40, 'coverage_status':'declared_all_10',
                'hf_check_status':'failed', 'hf_check_error':'HF check: ConnectionError',
                'version_cutoff_at':'2026-10-12T12:00:00Z', 'hf_check_context':'current-context',
                'task_checkpoint_links':{str(index):'https://huggingface.co/team/model' for index in range(10)}}
            backend = Mock(return_value={'jobs':[job]})
            modules = {'process_queue':SimpleNamespace(api=backend), 'version_selection':SimpleNamespace(cutoff_seconds=lambda value:0)}
            state = {}
            with patch.dict('sys.modules', modules), patch('watch_preparation.time.time', return_value=100):
                maintain({'organizer_token_file':str(token), 'api_url':'https://example.test', 'organizer_email':'owner@example.test'}, state)
                self.assertEqual(backend.call_args.args[3], 'reviewer_checkpoint_check')
                self.assertEqual(backend.call_args.kwargs['status'], 'checking')
                self.assertNotIn('reviewer_retry_preparation', [call.args[3] for call in backend.call_args_list])
                backend.reset_mock()
                maintain({'organizer_token_file':str(token), 'api_url':'https://example.test', 'organizer_email':'owner@example.test'}, state)
                self.assertEqual(backend.call_count, 1, 'Backoff prevents repeated retry mutations')


if __name__ == '__main__':
    unittest.main()
