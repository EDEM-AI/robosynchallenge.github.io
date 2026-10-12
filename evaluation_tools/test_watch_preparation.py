import unittest
from watch_preparation import transient, source_urls


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


if __name__ == '__main__':
    unittest.main()
