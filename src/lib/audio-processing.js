const DEFAULTS = Object.freeze({
  normalize: false,
  trimSilence: false,
  targetRmsDb: -18,
  peakCeilingDb: -1,
  silenceThresholdDb: -55,
  edgePaddingSeconds: 0.075
});

export function processAudioSamples(input, sampleRate, options = {}) {
  if (!ArrayBuffer.isView(input) || !(input instanceof Float32Array)) {
    throw new TypeError("Audio processing expects mono Float32 samples.");
  }
  const rate = Number(sampleRate);
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError("A valid sample rate is required.");

  const settings = { ...DEFAULTS, ...options };
  let start = 0;
  let end = input.length;
  const threshold = 10 ** (Number(settings.silenceThresholdDb) / 20);
  const padding = Math.max(0, Math.round(rate * Number(settings.edgePaddingSeconds)));

  if (settings.trimSilence && input.length) {
    let first = -1;
    let last = -1;
    for (let index = 0; index < input.length; index += 1) {
      if (Math.abs(input[index]) > threshold) {
        if (first < 0) first = index;
        last = index;
      }
    }
    if (first >= 0) {
      start = Math.max(0, first - padding);
      end = Math.min(input.length, last + padding + 1);
    }
  }

  const source = input.subarray(start, end);
  let gain = 1;
  if (settings.normalize && source.length) {
    let sumSquares = 0;
    let peak = 0;
    for (const sample of source) {
      const absolute = Math.abs(sample);
      sumSquares += sample * sample;
      if (absolute > peak) peak = absolute;
    }
    const rms = Math.sqrt(sumSquares / source.length);
    if (rms > 0 && peak > 0) {
      const targetRms = 10 ** (Number(settings.targetRmsDb) / 20);
      const peakCeiling = 10 ** (Number(settings.peakCeilingDb) / 20);
      gain = Math.min(targetRms / rms, peakCeiling / peak);
    }
  }

  // Reuse the source view when no gain change is needed. This avoids a
  // second full-size allocation for long scripts when both effects are off.
  let samples = source;
  if (gain !== 1) {
    samples = new Float32Array(source.length);
    for (let index = 0; index < source.length; index += 1) {
      samples[index] = Math.max(-1, Math.min(1, source[index] * gain));
    }
  }

  return {
    samples,
    gain,
    gainDb: gain > 0 ? 20 * Math.log10(gain) : 0,
    trimmedStartSeconds: start / rate,
    trimmedEndSeconds: (input.length - end) / rate,
    originalSampleCount: input.length,
    outputSampleCount: samples.length
  };
}
