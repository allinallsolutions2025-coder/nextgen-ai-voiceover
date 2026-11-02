import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVoiceCatalog } from "../src/lib/voice-catalog.js";

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

test("supports arrays of plain voice IDs", () => {
  const voices = normalizeVoiceCatalog(["am_adam", "af_heart"]);
  assert.deepEqual(voices.map(v => v.id), ["am_adam", "af_heart"]);
  assert.equal(voices[0].name, "Adam");
});

test("ignores malformed IDs and duplicate entries", () => {
  const voices = normalizeVoiceCatalog(["am_adam", "am_adam", "not-a-voice", "", "af_heart"]);
  assert.deepEqual(voices.map(v => v.id), ["am_adam", "af_heart"]);
});

test("returns an empty list when no catalogue is exposed", () => {
  assert.deepEqual(normalizeVoiceCatalog(undefined), []);
  assert.deepEqual(normalizeVoiceCatalog(null), []);
});