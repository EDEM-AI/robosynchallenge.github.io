import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'robosynchallenge_heldout_private/tools'))
from finals_version_freeze import process_queue, resolve_from_checkout, resolved_submission
from version_selection import cutoff_seconds

CUTOFF = '2026-11-16T12:00:00Z'


class FreezeTests(unittest.TestCase):
    def setUp(self):
        self.job = {'request_id':'real_fixture', 'fingerprint':'submission-fingerprint', 'submission':{
            'repository':'https://github.com/example/policy', 'code_ref':'main',
            'version_policy':'latest_before_deadline', 'version_cutoff_at':CUTOFF,
            'checkpoints':[{'id':'weights','repo':'example/weights','ref':'main','path':'weights'}]}}
        self.now = cutoff_seconds(CUTOFF) + 60

    def test_real_git_history_and_hf_metadata_only(self):
        from datetime import datetime
        calls = []
        def commits(*args, **kwargs):
            calls.append('history')
            return [SimpleNamespace(commit_id='c'*40,created_at=datetime.fromisoformat('2026-11-17T00:00:00+00:00')),
                SimpleNamespace(commit_id='b'*40,created_at=datetime.fromisoformat('2026-11-16T11:59:59+00:00'))]
        def info(*args, **kwargs):
            calls.append('metadata')
            self.assertEqual(kwargs['revision'],'b'*40)
            return SimpleNamespace(sha='b'*40,siblings=[SimpleNamespace(rfilename='weights/model.bin')])
        api = SimpleNamespace(list_repo_commits=commits,model_info=info)
        with tempfile.TemporaryDirectory() as directory:
            def git(*args, env=None):
                return subprocess.check_output(['git','-C',directory,*args],env=env,stderr=subprocess.DEVNULL,text=True).strip()
            git('init','-b','main')
            git('config','user.email','fixture@example.test')
            git('config','user.name','Fixture')
            def commit(author,committer):
                git('commit','--allow-empty','-m','Fixture',env={**os.environ,'GIT_AUTHOR_DATE':author,'GIT_COMMITTER_DATE':committer})
                return git('rev-parse','HEAD')
            expected=commit('2026-11-15T00:00:00+00:00','2026-11-16T11:59:58+00:00')
            commit('2026-11-17T00:00:00+00:00','2026-11-16T11:59:59+00:00')
            commit('2026-11-17T01:00:00+00:00','2026-11-17T01:00:00+00:00')
            report=resolve_from_checkout(self.job,directory,'main',api,False,self.now)
            self.assertEqual(report['code']['revision'],expected)
            self.assertEqual(report['checkpoints'][0]['revision'],'b'*40)
            self.assertEqual(calls,['history','metadata'])
            with self.assertRaisesRegex(ValueError,'cutoff'):
                resolve_from_checkout(self.job,directory,'main',api,False,cutoff_seconds(CUTOFF)-1)
            self.job['submission']['checkpoints'][0]['path']='missing'
            with self.assertRaisesRegex(ValueError,'absent'):
                resolve_from_checkout(self.job,directory,'main',api,False,self.now)

    def receipt(self):
        raw=json.dumps({'cutoff_at':CUTOFF,'code':{'repo':self.job['submission']['repository'],'revision':'a'*40},
            'checkpoints':[{**self.job['submission']['checkpoints'][0],'revision':'b'*40}]})
        return {'request_id':self.job['request_id'],'version_json':raw,'fingerprint':hashlib.sha256(raw.encode()).hexdigest()}

    def test_immutable_receipt_for_composer(self):
        receipt=self.receipt()
        result=resolved_submission(self.job,receipt)
        self.assertEqual(result['commit'],'a'*40)
        self.assertEqual(result['checkpoints'][0]['revision'],'b'*40)
        self.assertNotIn('commit',self.job['submission'])
        with self.assertRaisesRegex(ValueError,'mismatch'):
            resolved_submission(self.job,{**receipt,'version_json':'{}'})

    def test_waiting_existing_retry_and_backoff(self):
        retries={}; calls=[]
        def call(action,**fields):
            calls.append(action)
            self.assertEqual(fields['fingerprint'],self.job['fingerprint'])
            return {'versions':self.receipt()}
        def resolve(job):
            calls.append('resolve')
            return {'fixture':True}
        queue={'requests':[self.job]}
        result=process_queue(queue,call,resolve,cutoff_seconds(CUTOFF)-1,retries)
        self.assertEqual(result[0]['status'],'awaiting_deadline');self.assertEqual(calls,[])
        result=process_queue(queue,call,resolve,self.now,retries)
        self.assertEqual(result[0]['status'],'versions_frozen')
        self.assertEqual(calls,['resolve','finals_admin_freeze_versions'])
        calls.clear();self.job['versions']=self.receipt()
        result=process_queue(queue,call,resolve,self.now,retries)
        self.assertEqual(result[0]['status'],'versions_frozen');self.assertEqual(calls,[])
        del self.job['versions']
        def unavailable(job): raise TimeoutError('fixture')
        result=process_queue(queue,call,unavailable,self.now,retries)
        self.assertEqual(result[0]['status'],'retry')
        result=process_queue(queue,call,resolve,self.now+1,retries)
        self.assertEqual(result[0]['status'],'backoff')
        result=process_queue(queue,call,resolve,self.now+3600,retries)
        self.assertEqual(result[0]['status'],'versions_frozen');self.assertEqual(retries,{})


if __name__ == '__main__': unittest.main()
