import unittest

from draft_participant_receipts import DEADLINE, audit_job, draft, legal_selection, prepare_drafts, matching_hf_receipts, html_message


class ReceiptTests(unittest.TestCase):
    def job(self):
        return {"evaluation_id":"eval_example", "email":"a@example.com", "team_name":"Example",
                "submission_id":"sub_example", "artifact_name":"Final policy", "created_at":"2026-10-12T11:00:00Z",
                "version_cutoff_at":DEADLINE, "code_link":"https://github.com/team/code",
                "checkpoint_link":"https://huggingface.co/team/model",
                "hf_check_context":"context",
                "coverage_status":"legacy_unverified", "preparation_status":"failed", "hf_check_status":"pending",
                "preparation_error":"Submitted commit has no policy/ tree"}

    def test_no_request_never_claims_receipt_or_opens_submissions(self):
        subject, body = draft("Example", None, None)
        self.assertIn("Thank you", body)
        self.assertIn("have not received an eligible", body)
        self.assertNotIn("We have received", body)
        self.assertIn("does not reopen", body)

    def test_html_keeps_legacy_shell_and_commit_line_without_unescaped_text(self):
        value = html_message('<img src=x>\n\n'+'a'*40+' | https://github.com/team/code/tree/'+'a'*40+'\nNo legal commit', 'Confirmation')
        self.assertIn('font-family:Arial', value)
        self.assertIn('background:#f8f5ef', value)
        self.assertNotIn('<img', value)
        self.assertIn('href="https://github.com/', value)
        self.assertIn('<code', value)
        self.assertIn('No legal commit</strong>', value)

    def test_failed_code_does_not_invent_valid_commit(self):
        subject, body = draft("Example", self.job(), {"code_revision":""})
        self.assertIn("Evaluation ID: eval_example", body)
        self.assertIn("Code link on record", body)
        self.assertNotIn("Code preparation", body)
        self.assertNotIn("Submitted commit has no policy/ tree", body)
        self.assertIn("No legal commit", body)
        self.assertIn("Standard:", body)
        self.assertIn("Please await further contact", body)

    def test_unchanged_final_freeze_preserves_older_valid_branch_receipt(self):
        record = {"revision":"a"*40, "cutoff_at":"2026-10-11T12:00:00Z", "committed_at":"2026-10-10T11:00:00Z", "accessible":True}
        final = {**record,"cutoff_at":DEADLINE}
        self.assertTrue(matching_hf_receipts({"click_bell":record},{"click_bell":final},DEADLINE))
        self.assertFalse(matching_hf_receipts({"click_bell":record},{"click_bell":{**final,"revision":"b"*40}},DEADLINE))

    def test_pre_cutoff_only_and_no_naive_timestamps(self):
        record = {"revision":"a"*40, "cutoff_at":DEADLINE,"committed_at":"2026-10-12T11:59:59Z"}
        self.assertTrue(legal_selection(record,DEADLINE))
        self.assertFalse(legal_selection({**record,"committed_at":DEADLINE},DEADLINE))
        self.assertFalse(legal_selection({**record,"committed_at":"2026-10-12T11:59:59"},DEADLINE))

    def test_late_cutoff_requires_recorded_authorization(self):
        job = {**self.job(), "version_cutoff_at":"2026-10-13T00:00:00Z"}
        self.assertTrue(audit_job(job)["errors"])
        self.assertFalse(audit_job({**job,"preparation_attempt":1})["errors"])

    def test_branch_receipt_mismatch_is_rejected(self):
        record={"revision":"a"*40,"cutoff_at":DEADLINE,"committed_at":"2026-10-12T11:00:00Z","authored_at":"2026-10-12T11:00:00Z"}
        job={**self.job(),"code_bundle_commit":"b"*40,"code_selection":record,"code_participant_commit":"a"*40,"code_base_commit":"c"*40}
        manifest={"evaluation_id":job["evaluation_id"],"participant_commit":"a"*40,"private_base_commit":"c"*40}
        self.assertFalse(audit_job(job,manifest,"b"*40)["errors"])
        self.assertTrue(audit_job(job,manifest,"d"*40)["errors"])

    def test_one_per_exact_team_uses_submitting_account_and_excludes_only_explicit_test(self):
        people=[{"email":"other@example.com","team":"Example","status":"active"},
                {"email":"a@example.com","team":"Example","status":"active"},
                {"email":"organizer@example.com","team":"test","status":"active","intended_use":"test"},
                {"email":"learner@example.com","team":"test","status":"active","intended_use":"learning"}]
        job=self.job()
        rows, omitted=prepare_drafts(people,[job],{job["evaluation_id"]:{"code_revision":"","errors":[]}})
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]["to"],"a@example.com")
        self.assertEqual(rows[1]["to"],"learner@example.com")
        self.assertEqual(len(omitted),1)
        with self.assertRaises(ValueError):
            prepare_drafts(people,[job],{job["evaluation_id"]:{"code_revision":"","errors":["bad cutoff"]}})


if __name__ == "__main__":
    unittest.main()
