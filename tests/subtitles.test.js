import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSubtitleCues, getCreatorPreset, serializeSrt, serializeVtt
} from "../src/lib/subtitles.js";

test("creator presets define distinct caption layouts", () => {
  assert.equal(getCreatorPreset("shorts").aspectRatio, "9:16");
  assert.equal(getCreatorPreset("longform").aspectRatio, "16:9");
  assert.equal(getCreatorPreset("podcast").maxCharsPerLine, 44);
  assert.equal(getCreatorPreset("unknown").id, "shorts");
});

test("subtitle cues cover the measured audio duration and retain every word", () => {
  const script = "Welcome back to the channel. Today we are testing a new voiceover tool, and it works in your browser.";
  const cues = buildSubtitleCues(script, 12.4, { preset:"shorts" });
  assert.ok(cues.length >= 2);
  assert.equal(cues[0].start, 0);
  assert.equal(cues.at(-1).end, 12.4);
  assert.ok(cues.every(cue => cue.end > cue.start && cue.end <= 12.4));
  assert.equal(cues.map(cue => cue.text.replace(/\n/g, " ")).join(" "), script);
  assert.ok(cues.every(cue => cue.text.split("\n").length <= 2));
});

test("SRT and VTT use their correct timestamp delimiters", () => {
  const cues = [{ start:0, end:1.25, text:"Hello there." }];
  assert.match(serializeSrt(cues), /00:00:00,000 --> 00:00:01,250/);
  assert.match(serializeVtt(cues), /^WEBVTT\n\n00:00:00\.000 --> 00:00:01\.250/);
});

test("subtitle generation rejects a missing or invalid duration", () => {
  assert.throws(() => buildSubtitleCues("A sentence.", 0), /duration/);
  assert.deepEqual(buildSubtitleCues("", 2), []);
});
