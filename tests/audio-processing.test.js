import test from "node:test";
import assert from "node:assert/strict";
import { processAudioSamples } from "../src/lib/audio-processing.js";

test("audio processing leaves samples unchanged when effects are disabled", () => {
  const input = Float32Array.from([0, 0.2, -0.2, 0]);
  const result = processAudioSamples(input, 1000);
  assert.deepEqual([...result.samples], [...input]);
  assert.equal(result.gain, 1);
  assert.equal(result.trimmedStartSeconds, 0);
});

test("level matching raises average level without crossing the peak ceiling", () => {
  const input = Float32Array.from([0.1, -0.1, 0.1, -0.1]);
  const result = processAudioSamples(input, 48000, { normalize:true });
  assert.ok(result.gain > 1);
  assert.ok(result.samples.every(sample => Math.abs(sample) <= 10 ** (-1 / 20) + 1e-6));
  const rms = Math.sqrt(result.samples.reduce((sum, sample) => sum + sample * sample, 0) / result.samples.length);
  assert.ok(Math.abs(rms - 10 ** (-18 / 20)) < 1e-5);
});

test("silence trimming removes only leading and trailing low-level samples with padding", () => {
  const input = Float32Array.from([
    ...Array(200).fill(0),
    ...Array(100).fill(0.2),
    ...Array(200).fill(0)
  ]);
  const result = processAudioSamples(input, 1000, { trimSilence:true, edgePaddingSeconds:0.05 });
  assert.equal(result.outputSampleCount, 200);
  assert.equal(result.trimmedStartSeconds, 0.15);
  assert.equal(result.trimmedEndSeconds, 0.15);
  assert.equal(result.samples[0], 0);
});

test("audio processing validates the sample rate", () => {
  assert.throws(() => processAudioSamples(new Float32Array(1), 0), /sample rate/);
});
