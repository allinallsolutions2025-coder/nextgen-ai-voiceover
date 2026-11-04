const CREATOR_PRESETS = Object.freeze({
  shorts: Object.freeze({ id:"shorts", label:"Shorts / Reels", aspectRatio:"9:16", maxCharsPerLine:38, maxWordsPerCue:9 }),
  longform: Object.freeze({ id:"longform", label:"Long-form video", aspectRatio:"16:9", maxCharsPerLine:48, maxWordsPerCue:11 }),
  podcast: Object.freeze({ id:"podcast", label:"Podcast", aspectRatio:"16:9", maxCharsPerLine:44, maxWordsPerCue:10 }),
  narration: Object.freeze({ id:"narration", label:"Narration", aspectRatio:"16:9", maxCharsPerLine:58, maxWordsPerCue:13 })
});

export function getCreatorPreset(id) {
  return CREATOR_PRESETS[id] || CREATOR_PRESETS.shorts;
}

function splitSentences(text) {
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  return (normalized.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) || [normalized])
    .map(part => part.trim())
    .filter(Boolean);
}

function splitSentenceIntoCues(sentence, maxCharacters, maxWords) {
  const words = sentence.split(/\s+/).filter(Boolean);
  const maxCueCharacters = maxCharacters * 2;
  const cues = [];
  let current = [];

  for (const word of words) {
    const candidate = [...current, word].join(" ");
    if (current.length && (candidate.length > maxCueCharacters || current.length >= maxWords)) {
      cues.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) cues.push(current.join(" "));
  return cues;
}

function wrapCueText(text, maxCharacters) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (current && candidate.length > maxCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return lines.join("\n");

  // Cues are limited to two readable lines. Rebalance the tail instead of
  // silently dropping words when an unusually long token cannot be wrapped.
  const first = lines.slice(0, -1).join(" ");
  return first + "\n" + lines.at(-1);
}

function cueWeight(text) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const pauseMarks = (text.match(/[,;:]/g) || []).length;
  const sentenceEnd = /[.!?]["')\]]*$/.test(text) ? 0.45 : 0;
  return Math.max(1, wordCount + pauseMarks * 0.22 + sentenceEnd);
}

export function buildSubtitleCues(text, durationSeconds, options = {}) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new RangeError("A positive audio duration is required to time subtitles.");
  }
  const preset = getCreatorPreset(options.preset || "shorts");
  const maxCharacters = Math.max(18, Math.min(70, Number(options.maxCharsPerLine) || preset.maxCharsPerLine));
  const maxWords = Math.max(3, Math.min(20, Number(options.maxWordsPerCue) || preset.maxWordsPerCue));
  const phrases = splitSentences(text).flatMap(sentence =>
    splitSentenceIntoCues(sentence, maxCharacters, maxWords)
  );
  if (!phrases.length) return [];

  const weights = phrases.map(cueWeight);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const gap = phrases.length > 1 ? Math.min(0.04, duration / (phrases.length * 3)) : 0;
  const speechDuration = Math.max(0, duration - gap * (phrases.length - 1));
  let cursor = 0;

  return phrases.map((phrase, index) => {
    const start = cursor;
    const allocation = speechDuration * weights[index] / weightTotal;
    const end = index === phrases.length - 1 ? duration : Math.min(duration, start + allocation);
    cursor = end + gap;
    return {
      index: index + 1,
      start,
      end,
      text: wrapCueText(phrase, maxCharacters)
    };
  });
}

function timestamp(seconds, decimalSeparator) {
  const milliseconds = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((milliseconds % 60000) / 1000);
  const remainder = milliseconds % 1000;
  const pad = value => String(value).padStart(2, "0");
  return pad(hours) + ":" + pad(minutes) + ":" + pad(wholeSeconds) +
    decimalSeparator + String(remainder).padStart(3, "0");
}

export function serializeSrt(cues) {
  return (Array.isArray(cues) ? cues : []).map((cue, index) =>
    (index + 1) + "\n" +
    timestamp(cue.start, ",") + " --> " + timestamp(cue.end, ",") + "\n" +
    cue.text
  ).join("\n\n") + (cues?.length ? "\n" : "");
}

export function serializeVtt(cues) {
  const body = (Array.isArray(cues) ? cues : []).map(cue =>
    timestamp(cue.start, ".") + " --> " + timestamp(cue.end, ".") + "\n" + cue.text
  ).join("\n\n");
  return "WEBVTT\n\n" + (body ? body + "\n" : "");
}

export { CREATOR_PRESETS };
