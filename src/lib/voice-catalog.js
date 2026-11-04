const LANGUAGE_BY_PREFIX = {
  a: "en-us", b: "en-gb", e: "es", f: "fr", h: "hi", i: "it", j: "ja", p: "pt-br", z: "zh"
};
const LANGUAGE_LABELS = {
  "en-us": "American English", "en-gb": "British English", es: "Spanish",
  fr: "French", hi: "Hindi", it: "Italian", ja: "Japanese",
  "pt-br": "Brazilian Portuguese", zh: "Mandarin Chinese"
};
const LANGUAGE_ORDER = {
  "en-us": 0, "en-gb": 1, es: 2, fr: 3, hi: 4, it: 5, ja: 6, "pt-br": 7, zh: 8
};
const GENDER_ORDER = { Female: 0, Male: 1 };

const BUILT_IN_VOICE_GROUPS = [
  { language: "en-us", female: ["af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky"], male: ["am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa"] },
  { language: "en-gb", female: ["bf_alice", "bf_emma", "bf_isabella", "bf_lily"], male: ["bm_daniel", "bm_fable", "bm_george", "bm_lewis"] }
];

function voiceNameFromId(id) {
  const suffix = id.split("_").slice(1).join("_");
  return suffix.replace(/(^|_)([a-z])/g, (_, separator, letter) => separator + letter.toUpperCase());
}
function compareVoices(left, right) {
  return (LANGUAGE_ORDER[left.language] ?? 99) - (LANGUAGE_ORDER[right.language] ?? 99) ||
    (GENDER_ORDER[left.gender] ?? 99) - (GENDER_ORDER[right.gender] ?? 99) ||
    left.name.localeCompare(right.name);
}

export function normalizeVoiceCatalog(rawCatalog) {
  const source = rawCatalog && typeof rawCatalog === "object" && rawCatalog.voices ? rawCatalog.voices : rawCatalog;
  let entries = [];
  if (Array.isArray(source)) {
    entries = source.map((item) => {
      if (typeof item === "string") return [item, {}];
      return [item?.id ?? item?.voice ?? item?.key, item ?? {}];
    });
  } else if (source && typeof source === "object") {
    entries = Object.entries(source);
  }

  const seen = new Set();
  const voices = [];
  for (const [rawId, rawMetadata] of entries) {
    const id = String(rawId ?? "").trim();
    // This catalogue is deliberately Kokoro-English only (US + UK).
    // Multilingual speech is provided by a separate engine, not extra Kokoro IDs.
    if (!/^[ab][fm]_[a-z0-9_]+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const metadata = rawMetadata && typeof rawMetadata === "object" ? rawMetadata : {};
    const language = String(metadata.language ?? LANGUAGE_BY_PREFIX[id[0]] ?? "unknown").toLowerCase();
    const gender = String(metadata.gender ?? (id[1] === "f" ? "Female" : id[1] === "m" ? "Male" : "Unknown"));
    voices.push({
      id,
      name: String(metadata.name ?? voiceNameFromId(id)),
      language,
      languageLabel: LANGUAGE_LABELS[language] ?? language.toUpperCase(),
      gender
    });
  }
  return voices.sort(compareVoices);
}

export function getCompleteVoiceCatalog(rawCatalog) {
  const complete = new Map();
  for (const group of BUILT_IN_VOICE_GROUPS) {
    for (const id of group.female) complete.set(id, {
      id, name: voiceNameFromId(id), language: group.language,
      languageLabel: LANGUAGE_LABELS[group.language], gender: "Female"
    });
    for (const id of group.male) complete.set(id, {
      id, name: voiceNameFromId(id), language: group.language,
      languageLabel: LANGUAGE_LABELS[group.language], gender: "Male"
    });
  }
  for (const voice of normalizeVoiceCatalog(rawCatalog)) {
    const fallback = complete.get(voice.id);
    complete.set(voice.id, fallback
      ? { ...fallback, name: voice.name || fallback.name }
      : voice);
  }
  return [...complete.values()].sort(compareVoices);
}
