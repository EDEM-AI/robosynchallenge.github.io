import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

module = Path(__file__).resolve().parents[1] / "tools/preview_preliminary_leaderboard.py"
spec = importlib.util.spec_from_file_location("preliminary_preview", module)
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PublicPreviewTests(unittest.TestCase):
    def setUp(self):
        row = {key: 10.5 for key in preview.METRICS}
        row.update(evaluation_id=preview.ANONYMOUS_EVALUATION, team_name="Luxi Tech", model_name="HippoVLA",
                   weighted_all=10.5, review_status="reviewed", completed_tasks=10,
                   email="private@example.test", token="must-not-export", code_link="private-repository")
        self.board = {"tables": [{"id": task, "rows": [copy.deepcopy(row)]} for task in ("overall", *preview.TASKS)]}

    def test_anonymity_and_explicit_allowlist_apply_to_all_eleven_tables(self):
        output = preview.public_snapshot(self.board)
        self.assertEqual(output["team_count"], 1)
        for table in output["tables"]:
            row = table["rows"][0]
            self.assertEqual(row["team_name"], "AnonymousVLA")
            self.assertEqual(row["model_name"], "AnonymousVLA")
            self.assertEqual(row["rank"], 1)
        serialized = json.dumps(output).lower()
        for secret in ("luxi", "hippo", "private@example.test", "must-not-export", "private-repository", preview.ANONYMOUS_EVALUATION):
            self.assertNotIn(secret.lower(), serialized)

    def test_pending_blocked_incomplete_and_unscored_rows_are_not_published(self):
        for values in ({"review_status": "pending_review"}, {"review_status": "blocked"}, {"completed_tasks": 9}, {"weighted_all": None}):
            board = copy.deepcopy(self.board)
            for table in board["tables"]:
                table["rows"][0].update(values)
            output = preview.public_snapshot(board)
            self.assertEqual(output["team_count"], 0)
            self.assertTrue(all(not table["rows"] for table in output["tables"]))

    def test_order_and_unrounded_scores_are_preserved(self):
        for table in self.board["tables"]:
            a = copy.deepcopy(table["rows"][0])
            a.update(evaluation_id="other", model_name="Other", team_name="Other", rank=99)
            table["rows"].insert(0, a)
        output = preview.public_snapshot(self.board)
        self.assertEqual([row["model_name"] for row in output["tables"][0]["rows"]], ["Other", "AnonymousVLA"])
        self.assertEqual([row["rank"] for row in output["tables"][0]["rows"]], [1, 2])
        self.assertEqual(output["tables"][0]["rows"][0]["weighted_all"], 10.5)

    def test_missing_tables_missing_task_rows_duplicate_rows_and_missing_metrics_fail_closed(self):
        changes = [lambda b: b["tables"].pop(), lambda b: b["tables"][1]["rows"].clear(),
                   lambda b: b["tables"][1]["rows"].append(copy.deepcopy(b["tables"][1]["rows"][0])),
                   lambda b: b["tables"][1]["rows"][0].update(inference_ms=None)]
        for change in changes:
            board = copy.deepcopy(self.board)
            change(board)
            with self.assertRaises(ValueError):
                preview.public_snapshot(board)

    def test_local_server_exposes_only_safe_snapshot_and_public_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.html").write_text("preview")
            (root / "faq").mkdir()
            (root / "faq/index.html").write_text("faq-preview")
            (root / "apps-script").mkdir()
            (root / "apps-script/private.gs").write_text("secret")
            (root / "static").mkdir()
            (root / "static/reviewer-preview.json").write_text("private")
            snapshot = root / "snapshot.json"
            preview.private_write(snapshot, preview.public_snapshot(self.board))
            server = ThreadingHTTPServer(("127.0.0.1", 0), preview.handler(root, snapshot))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                base = "http://127.0.0.1:" + str(server.server_port)
                self.assertEqual(urlopen(base + "/").read(), b"preview")
                self.assertEqual(urlopen(base + "/faq/").read(), b"faq-preview")
                self.assertEqual(urlopen(base + "/faq").read(), b"faq-preview")
                self.assertEqual(urlopen(base + "/faq/index.html").read(), b"faq-preview")
                config = urlopen(base + "/static/config.js").read().decode()
                self.assertIn('API_BASE_URL:""', config)
                self.assertNotIn("script.google.com", config)
                self.assertEqual(json.load(urlopen(base + "/__preview__/preliminary-leaderboard.json"))["team_count"], 1)
                for path in ("/apps-script/private.gs", "/static/reviewer-preview.json", "/snapshot.json", "/static/"):
                    with self.assertRaises(HTTPError) as error:
                        urlopen(base + path)
                    self.assertEqual(error.exception.code, 404)
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(base + "/", data=b"{}"))
                self.assertEqual(error.exception.code, 405)
            finally:
                server.shutdown()
                thread.join()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
