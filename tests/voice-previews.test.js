import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateVoicePreviewManifest, verifyVoicePreviewBlob } from "../src/lib/voice-previews.js";

const expected = {
  modelId: "kokoro-test-model",
  modelRevision: "test-revision",
  previewVersion: 2,
  voiceIds: ["af_heart", "bf_emma"]
};

function wavBytes() {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);
  const write = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, 2, true);
  return bytes;
}

function manifestFor(ids = expected.voiceIds) {
  const previews = ids.map(id => ({
    id, file: id + ".wav", bytes: 46,
    sha256: createHash("sha256").update(wavBytes()).digest("hex")
  }));
  return { ...expected, previews };
}

test("accepts a complete, unique English preview manifest", () => {
  const result = validateVoicePreviewManifest(manifestFor(), expected);
  assert.deepEqual(result.map(entry => entry.id), expected.voiceIds);
});

test("rejects incompatible model metadata and incomplete voice sets", () => {
  assert.throws(() => validateVoicePreviewManifest({ ...manifestFor(), modelRevision: "other" }, expected), /does not match/);
  assert.throws(() => validateVoicePreviewManifest(manifestFor(["af_heart"]), expected), /complete English voice set/);
});

test("rejects duplicate, unknown, and path-like preview entries", () => {
  const duplicate = manifestFor();
  duplicate.previews[1] = { ...duplicate.previews[0] };
  assert.throws(() => validateVoicePreviewManifest(duplicate, expected), /unknown or duplicate/);
  const unknown = manifestFor();
  unknown.previews[1] = { ...unknown.previews[1], id: "zf_voice", file: "zf_voice.wav" };
  assert.throws(() => validateVoicePreviewManifest(unknown, expected), /unknown or duplicate/);
  const unsafePath = manifestFor();
  unsafePath.previews[0] = { ...unsafePath.previews[0], file: "../af_heart.wav" };
  assert.throws(() => validateVoicePreviewManifest(unsafePath, expected), /filename is invalid/);
});

test("rejects missing byte counts and malformed SHA-256 metadata", () => {
  const badBytes = manifestFor();
  badBytes.previews[0] = { ...badBytes.previews[0], bytes: 12 };
  assert.throws(() => validateVoicePreviewManifest(badBytes, expected), /metadata is incomplete/);
  const badHash = manifestFor();
  badHash.previews[0] = { ...badHash.previews[0], sha256: "not-a-checksum" };
  assert.throws(() => validateVoicePreviewManifest(badHash, expected), /metadata is incomplete/);
});

test("verifies WAV framing, exact byte count and SHA-256 content", async () => {
  const bytes = wavBytes();
  const entry = manifestFor().previews[0];
  assert.equal(await verifyVoicePreviewBlob(entry, new Blob([bytes])), true);
  await assert.rejects(verifyVoicePreviewBlob(entry, new Blob([bytes.slice(0, 45)])), /unexpected file size/);
  const corrupted = bytes.slice();
  corrupted[45] = 1;
  await assert.rejects(verifyVoicePreviewBlob(entry, new Blob([corrupted])), /SHA-256 integrity check/);
  await assert.rejects(verifyVoicePreviewBlob(entry, new Blob([new Uint8Array(46)])), /valid WAV/);
});

test("fails safely when Web Crypto is unavailable", async () => {
  const entry = manifestFor().previews[0];
  await assert.rejects(verifyVoicePreviewBlob(entry, new Blob([wavBytes()]), null), /secure browser context/);
});
