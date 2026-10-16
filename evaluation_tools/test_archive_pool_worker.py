import hashlib
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from archive_pool_worker import choose_slot, migrate, clean_stale_spools, runtime_settings, cleanup_allowed, private_write


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.data = b"synthetic evidence"
        self.sha = hashlib.sha256(self.data).hexdigest()
        self.record = {"task":"click_bell", "artifacts":{"sha256":self.sha}}
        self.candidate = {"evaluation_id":"eval_abc", "task":"click_bell", "upload_id":"arc_abc",
            "sha256":self.sha, "size":len(self.data), "record_hash":"opaque-hash", "record":self.record}
        self.original = {"id":"source-zip", "size":len(self.data), "eTag":"source-tag"}
        self.saved = {"id":"dest-zip", "size":len(self.data), "eTag":"dest-tag"}
        self.saved_json = {"id":"dest-json", "eTag":"json-tag"}
        def verify(item, expected, sink=None, size_limit=None):
            if expected != self.sha:
                raise ValueError("Bad hash")
            if sink:
                sink.write(self.data)
        self.source = SimpleNamespace(profile={"drive_id":"source"}, at=Mock(side_effect=[self.original, {"id":"source-json"}]),
            manifest=Mock(return_value=self.record), verify=Mock(side_effect=verify))
        self.target = SimpleNamespace(profile={"drive_id":"dest"}, base="/drives/dest",
            graph=Mock(return_value={"quota":{"remaining":10**12,"state":"normal"}}),
            folders=Mock(return_value="target-folder"), upload=Mock(side_effect=[self.saved,self.saved_json]),
            verify=Mock(side_effect=verify), manifest=Mock(return_value=self.record), item=Mock(return_value=self.saved))
        self.events = []
        self.location = {"slot":"slot-02", "zip_item_id":"dest-zip", "status":"ready"}
        def call(action, **fields):
            self.events.append(action)
            if action.endswith("publish"):
                return {"ok":True,"location":self.location}
            if action == "reviewer_resolve_evidence":
                return {"ok":True,"storage":"slot-02","download_url":"https://example.test/signed"}
            return {"ok":True,"source_removed":True}
        self.backend = SimpleNamespace(call=Mock(side_effect=call))
        self.report = Mock()

    def run_migration(self, cleanup=True):
        migrate(self.candidate,self.source,{"slot-02":self.target},self.backend,self.root,self.report,0,cleanup=cleanup)

    def test_verify_publish_resolve_then_cleanup_and_remove_local_spool(self):
        self.run_migration()
        self.assertEqual(self.events,["reviewer_archive_pool_publish","reviewer_resolve_evidence","reviewer_archive_pool_cleanup"])
        self.assertEqual(list(self.root.iterdir()),[])
        self.source.verify.assert_called_once()
        self.target.verify.assert_called_once()

    def test_copy_only_never_calls_cleanup(self):
        self.run_migration(cleanup=False)
        self.assertNotIn("reviewer_archive_pool_cleanup",self.events)

    def test_cleanup_switch_is_checked_after_publish_and_navigation(self):
        allowed = {"enabled":True}
        original_call = self.backend.call.side_effect
        def revoke(action, **fields):
            result = original_call(action, **fields)
            if action == "reviewer_resolve_evidence":
                allowed["enabled"] = False
            return result
        self.backend.call.side_effect = revoke
        self.run_migration(cleanup=lambda:allowed["enabled"])
        self.assertEqual(self.events,["reviewer_archive_pool_publish","reviewer_resolve_evidence"])
        self.assertEqual(self.report.call_args.args[0], "ready_copy_only")

    def test_cleanup_callback_failure_cannot_delete(self):
        with self.assertRaises(OSError):
            self.run_migration(cleanup=Mock(side_effect=OSError("Unavailable settings")))
        self.assertNotIn("reviewer_archive_pool_cleanup",self.events)

    def test_bad_source_or_destination_never_publishes_or_deletes(self):
        for drive in (self.source,self.target):
            with self.subTest(drive=drive):
                self.setUp()
                current = self.source if drive.profile["drive_id"] == "source" else self.target
                current.verify.side_effect = ValueError("SHA256 mismatch")
                with self.assertRaises(ValueError):
                    self.run_migration()
                self.assertEqual(self.events,[])

    def test_wrong_manifest_never_publishes_or_deletes(self):
        self.target.manifest.return_value = {"different":True}
        with self.assertRaises(ValueError):
            self.run_migration()
        self.assertEqual(self.events,[])

    def test_failed_publication_or_navigation_never_deletes_source(self):
        def fail(action, **fields):
            self.events.append(action)
            raise ValueError("Registration changed")
        self.backend.call.side_effect = fail
        with self.assertRaises(ValueError):
            self.run_migration()
        self.assertNotIn("reviewer_archive_pool_cleanup",self.events)

    def test_ready_mapping_resumes_without_upload_and_rechecks_target(self):
        self.candidate["location"] = self.location
        self.run_migration()
        self.target.upload.assert_not_called()
        self.source.verify.assert_not_called()
        self.target.verify.assert_called_once()
        self.assertEqual(self.events,["reviewer_resolve_evidence","reviewer_archive_pool_cleanup"])

    def test_capacity_and_ingress_alias_fail_closed(self):
        self.target.graph.return_value = {"quota":{"remaining":1,"state":"normal"}}
        with self.assertRaises(ValueError):
            choose_slot({"slot-02":self.target},100,10)
        self.target.graph.return_value = {"quota":{"state":"normal"}}
        with self.assertRaises(ValueError):
            choose_slot({"slot-02":self.target},100,10)
        self.target.graph.return_value = {"quota":{"remaining":1000,"state":"normal"}}
        self.target.profile["drive_id"] = "source"
        with self.assertRaises(ValueError):
            self.run_migration()
        self.assertEqual(self.events,[])

    def test_inflight_reservations_cannot_overbook_pool_capacity(self):
        self.target.graph.return_value = {"quota":{"remaining":1000,"state":"normal"}}
        self.assertEqual(choose_slot({"slot-02":self.target},400,100,{"slot-02":400})[0],"slot-02")
        with self.assertRaises(ValueError):
            choose_slot({"slot-02":self.target},400,100,{"slot-02":501})

    def test_restart_cleanup_only_removes_our_transfer_caches(self):
        cache = self.root / "transfer-interrupted"
        cache.mkdir()
        (cache / "evidence.zip").write_bytes(self.data)
        keep = self.root / "unrelated"
        keep.mkdir()
        clean_stale_spools(self.root)
        self.assertFalse(cache.exists())
        self.assertTrue(keep.exists())
        (self.root / "transfer-link").symlink_to(keep)
        with self.assertRaises(ValueError):
            clean_stale_spools(self.root)
        self.assertTrue(keep.exists())


class RuntimeSettingsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "settings.json"
        self.settings = {"api_url":"https://example.test/backend", "organizer_email":"admin@example.test",
                         "organizer_token_file":"/private/token", "cleanup_enabled":True}
        private_write(self.path, self.settings)

    def test_defaults_and_runtime_changes_do_not_mutate_active_task_snapshot(self):
        snapshot = runtime_settings(self.path)
        self.assertEqual(snapshot["workers"],2)
        self.assertEqual(snapshot["reserve_gib"],2)
        self.settings.update(workers=4, reserve_gib=3, poll_seconds=10, retry_seconds=30)
        private_write(self.path, self.settings)
        updated = runtime_settings(self.path)
        self.assertEqual(updated["workers"],4)
        self.assertEqual(updated["poll_seconds"],10)
        self.assertEqual(snapshot["workers"],2)
        self.assertTrue(cleanup_allowed(self.path, snapshot))

    def test_invalid_options_are_rejected(self):
        for name, value in [("workers",0),("workers",5),("workers",True),("reserve_gib",0),
                            ("poll_seconds",1),("retry_seconds",-1),("cleanup_enabled","true")]:
            with self.subTest(name=name, value=value):
                private_write(self.path, {**self.settings, name:value})
                with self.assertRaises(ValueError):
                    runtime_settings(self.path)
                self.assertFalse(cleanup_allowed(self.path, self.settings))

    def test_cleanup_revoked_or_invalid_settings_fail_closed(self):
        self.assertTrue(cleanup_allowed(self.path, self.settings))
        for value in [{**self.settings, "cleanup_enabled":False},
                      {**self.settings, "api_url":"https://other.test/backend"},
                      {**self.settings, "proxy":"http://other.test"}, [], {}]:
            private_write(self.path, value)
            self.assertFalse(cleanup_allowed(self.path, self.settings))
        self.path.write_text("{")
        self.assertFalse(cleanup_allowed(self.path, self.settings))
        self.path.unlink()
        self.assertFalse(cleanup_allowed(self.path, self.settings))


if __name__ == "__main__":
    unittest.main()
