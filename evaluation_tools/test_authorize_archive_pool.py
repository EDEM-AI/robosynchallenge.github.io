import base64
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from authorize_archive_pool import private_json, receive_authorization, target_identity, ensure_folder, main


class PoolAuthorizationTests(unittest.TestCase):
    def test_credentials_are_private_and_never_overwritten(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "owner.json"
            private_json(path, {"synthetic": "secret"})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                private_json(path, {})
            link = Path(root) / "link"
            link.symlink_to(path)
            with self.assertRaises(FileExistsError):
                private_json(link, {})
            self.assertEqual(json.loads(path.read_text()), {"synthetic": "secret"})

    def test_actual_account_must_be_different_from_ingress(self):
        helper = SimpleNamespace(graph=Mock(side_effect=[
            {"mail": "second@example.com"}, {"id": "destination"}]))
        email, drive = target_identity(helper, {"access_token": "synthetic"}, {"drive_id": "source"}, "")
        self.assertEqual((email, drive["id"]), ("second@example.com", "destination"))
        helper.graph.side_effect = [{"mail": "second@example.com"}, {"id": "source"}]
        with self.assertRaisesRegex(ValueError, "different OneDrive"):
            target_identity(helper, {"access_token": "synthetic"}, {"drive_id": "source"}, "")

    def test_expected_identity_rejected_before_accessing_destination(self):
        helper = SimpleNamespace(graph=Mock(return_value={"mail": "wrong@example.com"}))
        with self.assertRaisesRegex(ValueError, "does not match"):
            target_identity(helper, {"access_token": "synthetic"}, {"drive_id": "source"}, "right@example.com")
        helper.graph.assert_called_once()

    def test_rclone_result_is_not_printed_and_private_output_is_removed(self):
        token = {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh"}
        encoded = base64.urlsafe_b64encode(json.dumps({"token": json.dumps(token)}).encode()).decode()

        def parse(line):
            return token if line == encoded else None

        def launch(command, **kwargs):
            self.assertEqual(command[1:3], ["authorize", "onedrive"])
            config = json.loads(base64.urlsafe_b64decode(command[3] + "=" * (-len(command[3]) % 4)))
            self.assertEqual(config["access_scopes"], "Files.ReadWrite User.Read offline_access")
            self.assertNotIn("auth_url", config)
            self.assertNotIn("RCLONE_ONEDRIVE_DISABLE_SITE_PERMISSION", kwargs["env"])
            kwargs["stdout"].write(encoded + "\n")
            kwargs["stdout"].flush()
            return SimpleNamespace(poll=lambda: 0, returncode=0)

        helper = SimpleNamespace(RCLONE_VERSION="v1.75.2", parse_authorization=parse)
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ, {
                "RCLONE_ONEDRIVE_DISABLE_SITE_PERMISSION": "true"}), \
                patch("authorize_archive_pool.subprocess.check_output", return_value="rclone v1.75.2\n"), \
                patch("authorize_archive_pool.subprocess.Popen", side_effect=launch), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(receive_authorization(helper, Path("rclone"), Path(root), 5), token)
            self.assertFalse((Path(root) / "rclone-output.private").exists())
            self.assertNotIn("synthetic", output.getvalue())

    def test_unexpected_rclone_version_does_not_start_login(self):
        helper = SimpleNamespace(RCLONE_VERSION="v1.75.2")
        with tempfile.TemporaryDirectory() as root, \
                patch("authorize_archive_pool.subprocess.check_output", return_value="rclone v0.0.0\n"), \
                patch("authorize_archive_pool.subprocess.Popen") as launch:
            with self.assertRaises(ValueError):
                receive_authorization(helper, Path("rclone"), Path(root), 5)
            launch.assert_not_called()

    def test_existing_pool_folder_must_be_a_folder(self):
        helper = SimpleNamespace(graph=Mock(return_value={"id": "folder", "folder": {}}))
        self.assertEqual(ensure_folder(helper, {"access_token": "synthetic"}, "pool")["id"], "folder")
        helper.graph.return_value = {"id": "file", "file": {}}
        with self.assertRaises(ValueError):
            ensure_folder(helper, {"access_token": "synthetic"}, "pool")

    def test_authorize_only_saves_credentials_but_never_writes_cloud_files(self):
        token = {"access_token":"synthetic-access", "refresh_token":"synthetic-refresh"}
        helper = SimpleNamespace(graph=Mock(side_effect=[{"mail":"second@example.com"},
            {"id":"destination", "quota":{"remaining":1024}}]), save_owner_profile=Mock())
        with tempfile.TemporaryDirectory() as root:
            source, pool = Path(root) / "source.json", Path(root) / "pool"
            private_json(source, {"drive_id":"source"})
            argv = ["authorize_archive_pool.py", "--source-owner", str(source),
                    "--pool-root", str(pool), "--email", "second@example.com", "--authorize-only"]
            with patch("sys.argv", argv), patch("authorize_archive_pool.receive_authorization", return_value=token), \
                    patch("authorize_archive_pool.ensure_folder") as folder, \
                    contextlib.redirect_stdout(io.StringIO()) as output, \
                    patch("authorize_archive_pool.importlib.import_module", return_value=helper):
                main()
            folder.assert_not_called()
            helper.save_owner_profile.assert_not_called()
            self.assertEqual(helper.graph.call_count, 2)
            self.assertEqual(json.loads((pool / "onedrive-02/authorization.pending").read_text()), token)
            self.assertFalse((pool / "onedrive-02/owner.json").exists())
            self.assertFalse((pool / "onedrive-02/account.json").exists())
            self.assertNotIn("synthetic", output.getvalue())
            self.assertIn('"status": "authorized_pending_probe"', output.getvalue())


if __name__ == "__main__":
    unittest.main()
