export async function getAudioDurationSeconds(blob) {
  if (!(blob instanceof Blob) || blob.size < 16) {
    throw new TypeError("A generated audio file is required to measure duration.");
  }

  // The app writes a standard 44-byte, mono PCM WAV header. Reading the byte
  // rate and data length avoids decoding several minutes of audio into memory.
  if (blob.type === "audio/wav" || blob.type === "audio/wave") {
    const header = new DataView(await blob.slice(0, 44).arrayBuffer());
    if (header.byteLength >= 44 && header.getUint32(0, true) === 0x46464952 &&
        header.getUint32(8, true) === 0x45564157) {
      const byteRate = header.getUint32(28, true);
      const dataBytes = header.getUint32(40, true);
      if (byteRate > 0 && dataBytes > 0) return dataBytes / byteRate;
    }
  }

  const metadataDuration = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let timeoutId;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.removeEventListener("error", onError);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(value);
    };
    const onMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) finish(null, audio.duration);
      else finish(new Error("The browser did not report a valid audio duration."));
    };
    const onError = () => finish(new Error("The browser could not read the generated audio metadata."));
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", onMetadata);
    audio.addEventListener("error", onError);
    timeoutId = setTimeout(() => finish(new Error("Timed out while reading audio duration.")), 15000);
    audio.src = url;
    audio.load();
  }).catch(() => null);

  if (Number.isFinite(metadataDuration) && metadataDuration > 0) return metadataDuration;

  // MP3 files are encoded by this app at a fixed 128 kbps CBR. This fallback
  // is approximate and is used only if browser metadata is unavailable.
  if (blob.type === "audio/mpeg") {
    const estimated = blob.size * 8 / 128000;
    if (Number.isFinite(estimated) && estimated > 0) return estimated;
  }
  throw new Error("Could not determine the generated audio duration.");
}
