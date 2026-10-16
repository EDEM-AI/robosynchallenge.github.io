from copy import deepcopy
import unittest

from archive_pool_plan import plan


class PoolPlanTests(unittest.TestCase):
    def setUp(self):
        self.jobs = [{"evaluation_id":"eval_abc", "uploads":[{"task":"click_bell", "status":"completed"}],
            "results":[{"task":"click_bell", "status":"submitted", "artifacts":{"sha256":"a"*64}}]}]
        self.files = [{"id":name, "name":name, "eTag":"tag", "size":10, "file":{},
            "parentReference":{"path":"/drives/source/root:/RoboSynChallenge_eval/eval_abc/click_bell/latest"}}
            for name in ("evidence.zip", "result.json")]

    def test_completed_registered_pair_is_a_candidate_not_a_mutation(self):
        snapshot = deepcopy((self.jobs, self.files))
        result = plan(self.jobs, self.files)
        self.assertEqual(result["candidate_bytes"], 20)
        self.assertEqual(result["candidates"][0]["sha256"], "a"*64)
        self.assertTrue(result["read_only"])
        self.assertFalse(result["migration_enabled"])
        self.assertEqual((self.jobs, self.files), snapshot)

    def test_uploading_file_must_not_move_even_with_a_result(self):
        for status in ("uploading", "verified", "failed", "superseded"):
            self.jobs[0]["uploads"][0]["status"] = status
            result = plan(self.jobs, self.files)
            self.assertEqual(result["candidates"], [])
            self.assertEqual(result["skipped"][0]["reason"], "upload_not_registered_complete")

    def test_missing_result_missing_json_and_missing_hash_fail_closed(self):
        for change in ("result", "json", "sha256"):
            jobs, files = deepcopy((self.jobs, self.files))
            if change == "result":
                jobs[0]["results"] = []
            elif change == "json":
                files.pop()
            else:
                jobs[0]["results"][0]["artifacts"] = {}
            self.assertFalse(plan(jobs, files)["candidates"])

    def test_duplicate_source_or_backend_rows_fail_closed(self):
        self.assertFalse(plan(self.jobs, self.files + [self.files[0]])["candidates"])
        self.jobs[0]["uploads"] *= 2
        self.assertFalse(plan(self.jobs, self.files)["candidates"])

    def test_unrelated_roots_history_and_changed_source_identity_are_excluded(self):
        for path in ("/drives/source/root:/personal/eval_abc/click_bell/latest",
                     "/drives/source/root:/RoboSynChallenge_eval/eval_abc/click_bell/history",
                     "/drives/source/root:/RoboSynChallenge_eval/_history/eval_abc/click_bell/latest"):
            files = deepcopy(self.files)
            files[0]["parentReference"]["path"] = path
            self.assertFalse(plan(self.jobs, files)["candidates"])
        self.files[0].pop("eTag")
        self.assertFalse(plan(self.jobs, self.files)["candidates"])


if __name__ == "__main__":
    unittest.main()
