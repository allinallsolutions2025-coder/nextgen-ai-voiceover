import unittest

from api_security import matches_configured_api_key


class ApiSecurityTests(unittest.TestCase):
    def test_missing_server_secret_disables_api_access(self):
        self.assertFalse(matches_configured_api_key(None, "anything"))
        self.assertFalse(matches_configured_api_key("", "anything"))
        self.assertFalse(matches_configured_api_key("   ", "anything"))

    def test_missing_or_incorrect_client_key_is_rejected(self):
        self.assertFalse(matches_configured_api_key("configured-secret", None))
        self.assertFalse(matches_configured_api_key("configured-secret", ""))
        self.assertFalse(matches_configured_api_key("configured-secret", "wrong-secret"))

    def test_matching_configured_key_is_accepted(self):
        self.assertTrue(matches_configured_api_key("configured-secret", "configured-secret"))

    def test_non_ascii_keys_are_compared_as_utf8(self):
        self.assertTrue(matches_configured_api_key("clé-secrète", "clé-secrète"))
        self.assertFalse(matches_configured_api_key("clé-secrète", "clé-fausse"))


if __name__ == "__main__":
    unittest.main()
