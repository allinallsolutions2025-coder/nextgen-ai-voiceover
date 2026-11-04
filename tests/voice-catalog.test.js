import test from "node:test";
import assert from "node:assert/strict";
import { getCompleteVoiceCatalog, normalizeVoiceCatalog } from "../src/lib/voice-catalog.js";

test("reads metadata from Kokoro's tts.voices object", () => {
  const voices = normalizeVoiceCatalog({
    am_adam: { name: "Adam", language: "en-us", gender: "Male" },
    af_heart: { name: "Heart", language: "en-us", gender: "Female" },
    bf_emma: { name: "Emma", language: "en-gb", gender: "Female" }
  });
  assert.deepEqual(voices.map(v => v.id), ["af_heart", "am_adam", "bf_emma"]);
  assert.equal(voices[0].languageLabel, "American English");
  assert.equal(voices[2].languageLabel, "British English");
});

test("supports arrays of voice metadata objects", () => {
  const voices = normalizeVoiceCatalog([
    { id: "am_adam", name: "Adam", language: "en-us", gender: "Male" },
    { id: "af_heart", name: "Heart", language: "en-us", gender: "Female" }
  ]);
  assert.deepEqual(voices.map(v => v.id), ["af_heart", "am_adam"]);
});

test("supports arrays of English voice IDs and infers language and gender", () => {
  const voices = normalizeVoiceCatalog(["am_adam", "af_heart", "bf_emma", "bm_george"]);
  assert.deepEqual(voices.map(v => v.id), ["af_heart", "am_adam", "bf_emma", "bm_george"]);
  assert.equal(voices[0].name, "Heart");
  assert.equal(voices[0].languageLabel, "American English");
  assert.equal(voices[2].languageLabel, "British English");
  assert.equal(voices[2].gender, "Female");
});

test("removes all 26 non-English Kokoro IDs from the catalogue", () => {
  const voices = normalizeVoiceCatalog([
    "am_adam", "af_heart", "bf_emma", "bm_george",
    "ef_dora", "em_alex", "ff_siwis", "hf_alpha", "hm_psi",
    "if_sara", "im_nicola", "jf_alpha", "jm_kumo", "pf_dora",
    "pm_alex", "zf_xiaobei", "zm_yunjian"
  ]);
  assert.deepEqual(voices.map(v => v.id), ["af_heart", "am_adam", "bf_emma", "bm_george"]);
  assert(voices.every(v => v.language === "en-us" || v.language === "en-gb"));
});

test("merges only the 28 supported English Kokoro voices", () => {
  const voices = getCompleteVoiceCatalog({
    voices: {
      af_heart: { name: "Heart", language: "en-us", gender: "Female" },
      am_adam: { name: "Adam", language: "en-us", gender: "Male" },
      zf_xiaoyi: { name: "Xiaoyi", language: "zh", gender: "Female" },
      ff_siwis: { name: "Siwis", language: "fr", gender: "Female" }
    }
  });
  assert.equal(voices.length, 28);
  assert.equal(new Set(voices.map(v => v.id)).size, 28);
  assert(voices.every(v => ["en-us", "en-gb"].includes(v.language)));
  assert(voices.some(v => v.id === "af_heart"));
  assert(voices.some(v => v.id === "bf_emma"));
  assert(!voices.some(v => v.id === "zf_xiaoyi"));
  assert(!voices.some(v => v.id === "ff_siwis"));
});

test("ignores malformed IDs and duplicate entries", () => {
  const voices = normalizeVoiceCatalog(["am_adam", "am_adam", "not-a-voice", "", "af_heart"]);
  assert.deepEqual(voices.map(v => v.id), ["af_heart", "am_adam"]);
});

test("returns an empty list when no catalogue is exposed", () => {
  assert.deepEqual(normalizeVoiceCatalog(undefined), []);
  assert.deepEqual(normalizeVoiceCatalog(null), []);
});
