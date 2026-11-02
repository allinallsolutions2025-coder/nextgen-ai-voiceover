const LANGUAGE_LABELS = {
  "en-us": "American English",
  "en-gb": "British English"
};
const LANGUAGE_ORDER = { "en-us": 0, "en-gb": 1 };
const GENDER_ORDER = { Female: 0, Male: 1 };

function voiceNameFromId(id) {
  const suffix = id.split("_").slice(1).join("_");
  return suffix.replace(/(^|_)([a-z])/g, (_, separator, letter) => separator + letter.toUpperCase());
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
    if (!/^[a-z]{2}_[a-z0-9_]+$/.test(id) || seen.has(id)) continue;
    seen.add(id);

    const metadata = rawMetadata && typeof rawMetadata === "object" ? rawMetadata : {};
    const language = String(metadata.language ?? "unknown").toLowerCase();
    const gender = String(metadata.gender ?? "Unknown");
    voices.push({
      id,
      name: String(metadata.name ?? voiceNameFromId(id)),
      language,
      languageLabel: LANGUAGE_LABELS[language] ?? language.toUpperCase(),
      gender
    });
  }

  return voices.sort((left, right) =>
    (LANGUAGE_ORDER[left.language] ?? 99) - (LANGUAGE_ORDER[right.language] ?? 99) ||
    (GENDER_ORDER[left.gender] ?? 99) - (GENDER_ORDER[right.gender] ?? 99) ||
    left.name.localeCompare(right.name)
  );
}