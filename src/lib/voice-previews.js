const VOICE_ID_PATTERN = /^[ab][fm]_[a-z0-9_]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

/** Validate the complete, app-compatible list of bundled English voice previews. */
export function validateVoicePreviewManifest(manifest, expected) {
  if (!manifest || typeof manifest !== "object" ||
      manifest.modelId !== expected?.modelId ||
      manifest.modelRevision !== expected?.modelRevision ||
      manifest.previewVersion !== expected?.previewVersion ||
      !Array.isArray(manifest.previews)) {
    throw new Error("The saved voice preview library does not match this app version.");
  }

  const expectedIds = new Set(Array.isArray(expected?.voiceIds) ? expected.voiceIds : []);
  if (!expectedIds.size || [...expectedIds].some(id => !VOICE_ID_PATTERN.test(id)) ||
      manifest.previews.length !== expectedIds.size) {
    throw new Error("The saved voice preview manifest does not contain the complete English voice set.");
  }

  const seen = new Set();
  for (const entry of manifest.previews) {
    if (!entry || typeof entry !== "object" ||
        typeof entry.id !== "string" || !expectedIds.has(entry.id) || seen.has(entry.id)) {
      throw new Error("The saved voice preview manifest contains an unknown or duplicate voice.");
    }
    if (entry.file !== entry.id + ".wav") {
      throw new Error("The saved voice preview filename is invalid for " + entry.id + ".");
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 44 ||
        typeof entry.sha256 !== "string" || !SHA256_PATTERN.test(entry.sha256)) {
      throw new Error("The saved voice preview metadata is incomplete for " + entry.id + ".");
    }
    seen.add(entry.id);
  }

  if (seen.size !== expectedIds.size) {
    throw new Error("The saved voice preview manifest is missing one or more English voices.");
  }
  return manifest.previews;
}

/** Verify WAV framing, exact length and the SHA-256 digest recorded in the manifest. */
export async function verifyVoicePreviewBlob(entry, blob, cryptoProvider = globalThis.crypto) {
  if (!entry || !(blob instanceof Blob)) {
    throw new TypeError("A bundled voice preview WAV is required.");
  }
  if (blob.size !== entry.bytes) {
    throw new Error("Preview " + entry.id + " has an unexpected file size.");
  }

  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ascii = bytes => Array.from(bytes, value => String.fromCharCode(value)).join("");
  if (ascii(header.slice(0, 4)) !== "RIFF" || ascii(header.slice(8, 12)) !== "WAVE") {
    throw new Error("Preview " + entry.id + " is not a valid WAV file.");
  }
  if (!cryptoProvider?.subtle?.digest) {
    throw new Error("This browser cannot verify preview checksums; open the studio in a secure browser context.");
  }

  const digestBuffer = await cryptoProvider.subtle.digest("SHA-256", await blob.arrayBuffer());
  const digest = Array.from(new Uint8Array(digestBuffer), value => value.toString(16).padStart(2, "0")).join("");
  if (digest.toLowerCase() !== entry.sha256.toLowerCase()) {
    throw new Error("Preview " + entry.id + " failed its SHA-256 integrity check.");
  }
  return true;
}
