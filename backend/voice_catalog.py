LANGUAGE_GROUPS = [
    ("a", "en-us", "American English",
     ["af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky"],
     ["am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa"]),
    ("b", "en-gb", "British English",
     ["bf_alice", "bf_emma", "bf_isabella", "bf_lily"],
     ["bm_daniel", "bm_fable", "bm_george", "bm_lewis"]),
    ("e", "es", "Spanish", ["ef_dora"], ["em_alex", "em_santa"]),
    ("f", "fr", "French", ["ff_siwis"], []),
    ("h", "hi", "Hindi", ["hf_alpha", "hf_beta"], ["hm_omega", "hm_psi"]),
    ("i", "it", "Italian", ["if_sara"], ["im_nicola"]),
    ("j", "ja", "Japanese", ["jf_alpha", "jf_gongitsune", "jf_nezumi", "jf_tebukuro"], ["jm_kumo"]),
    ("p", "pt-br", "Brazilian Portuguese", ["pf_dora"], ["pm_alex", "pm_santa"]),
    ("z", "zh", "Mandarin Chinese", ["zf_xiaobei", "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi"],
     ["zm_yunjian", "zm_yunxi", "zm_yunxia", "zm_yunyang"]),
]

LANGUAGE_TEST_TEXT = {
    "a": "Hello. This is a voice engine test.",
    "b": "Good morning. This is a British English voice test.",
    "e": "Hola. Esta es una prueba de voz.",
    "f": "Bonjour. Ceci est un test vocal.",
    "h": "नमस्ते। यह आवाज़ परीक्षण है।",
    "i": "Ciao. Questo è un test vocale.",
    "j": "こんにちは。これは音声テストです。",
    "p": "Olá. Este é um teste de voz.",
    "z": "你好，这是语音测试。",
}


def _voice_name(voice_id: str) -> str:
    return voice_id.split("_", 1)[1].replace("_", " ").title()


VOICE_CATALOG = tuple(
    {
        "id": voice_id,
        "name": _voice_name(voice_id),
        "language_code": code,
        "language": language,
        "language_label": label,
        "gender": "Female" if voice_id[1] == "f" else "Male",
    }
    for code, language, label, female, male in LANGUAGE_GROUPS
    for voice_id in [*female, *male]
)
VOICE_BY_ID = {voice["id"]: voice for voice in VOICE_CATALOG}
LANGUAGE_BY_CODE = {group[0]: group for group in LANGUAGE_GROUPS}
