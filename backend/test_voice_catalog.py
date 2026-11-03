import unittest

from voice_catalog import LANGUAGE_GROUPS, VOICE_CATALOG, VOICE_BY_ID


class VoiceCatalogTests(unittest.TestCase):
    def test_catalog_has_54_unique_voices(self):
        ids = [voice["id"] for voice in VOICE_CATALOG]
        self.assertEqual(len(ids), 54)
        self.assertEqual(len(set(ids)), 54)

    def test_all_nine_language_codes_are_present(self):
        self.assertEqual(
            {group[0] for group in LANGUAGE_GROUPS},
            {"a", "b", "e", "f", "h", "i", "j", "p", "z"},
        )

    def test_reported_problem_voice_is_in_catalog(self):
        self.assertIn("zf_xiaoyi", VOICE_BY_ID)
        self.assertEqual(VOICE_BY_ID["zf_xiaoyi"]["language_code"], "z")

    def test_voice_ids_follow_kokoro_prefix_convention(self):
        for voice in VOICE_CATALOG:
            self.assertEqual(voice["id"][0], voice["language_code"])
            self.assertIn(voice["id"][1], {"f", "m"})


if __name__ == "__main__":
    unittest.main()
