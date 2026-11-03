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

test("supports arrays of plain voice IDs and infers language and gender", () => {
  const voices = normalizeVoiceCatalog(["am_adam", "af_heart", "hf_alpha", "jf_alpha", "zf_xiaobei"]);
  assert.deepEqual(voices.map(v => v.id), ["af_heart", "am_adam", "hf_alpha", "jf_alpha", "zf_xiaobei"]);
  assert.equal(voices[0].name, "Heart");
  assert.equal(voices[2].languageLabel, "Hindi");
  assert.equal(voices[2].gender, "Female");
  assert.equal(voices[4].languageLabel, "Mandarin Chinese");
});

test("merges the complete 54-voice Kokoro catalogue with runtime metadata", () => {
  const voices = getCompleteVoiceCatalog({
    voices: {
      af_heart: { name: "Heart", language: "en-us", gender: "Female" },
      am_adam: { name: "Adam", language: "en-us", gender: "Male" }
    }
  });
  assert.equal(voices.length, 54);
  assert.equal(new Set(voices.map(v => v.id)).size, 54);
  assert(voices.some(v => v.id === "ff_siwis" && v.languageLabel === "French"));
  assert(voices.some(v => v.id === "hf_alpha" && v.languageLabel === "Hindi"));
  assert(voices.some(v => v.id === "pf_dora" && v.languageLabel === "Brazilian Portuguese"));
  assert(voices.some(v => v.id === "zf_xiaobei" && v.languageLabel === "Mandarin Chinese"));
});

test("ignores malformed IDs and duplicate entries", () => {
  const voices = normalizeVoiceCatalog(["am_adam", "am_adam", "not-a-voice", "", "af_heart"]);
  assert.deepEqual(voices.map(v => v.id), ["am_adam", "af_heart"]);
});

test("returns an empty list when no catalogue is exposed", () => {
  assert.deepEqual(normalizeVoiceCatalog(undefined), []);
  assert.deepEqual(normalizeVoiceCatalog(null), []);
});
