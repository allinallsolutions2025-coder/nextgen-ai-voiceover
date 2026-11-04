const ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "prof", "sr", "jr", "st", "vs",
  "etc", "e.g", "i.e", "u.s", "u.k", "u.n", "a.m", "p.m", "ph.d",
  "fig", "no", "dept", "est", "inc", "ltd", "co", "corp",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"
]);

export function cleanCopiedLine(rawLine) {
  let line = String(rawLine ?? "").trim();
  if (!line) return "";

  const wrapped = line.match(/^(["'])([\s\S]*)\1\s*,?\s*$/);
  if (wrapped) line = wrapped[2];

  line = line
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\U([0-9a-fA-F]{8})/g, (_, hex) => {
      const codePoint = parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : _;
    })
    .replace(/\\([\\'"nt])/g, (_, character) => ({
      "\\": "\\",
      "'": "'",
      '"': '"',
      n: "\n",
      t: "\t"
    })[character]);

  return line.trim();
}

function isSentencePeriod(line, segmentStart, punctuationIndex, punctuationEnd) {
  const previous = line[punctuationIndex - 1] ?? "";
  const next = line.slice(punctuationEnd).trimStart()[0] ?? "";
  if (/\d/.test(previous) && /\d/.test(next)) return false;

  const prefix = line.slice(segmentStart, punctuationIndex);
  // The first dot in e.g./i.e./a.m./p.m. needs a look-ahead because the
  // abbreviation is not complete until its second letter and period.
  const precedingLetter = prefix.match(/([A-Za-z])$/)?.[1] ?? "";
  const followingDottedLetter = line.slice(punctuationEnd).match(/^([A-Za-z])\\./)?.[1] ?? "";
  const dottedPair = (precedingLetter + "." + followingDottedLetter).toLowerCase();
  if (followingDottedLetter && ABBREVIATIONS.has(dottedPair)) return false;

  // Keep dotted initials and abbreviations such as e.g., i.e. and U.S.
  // intact; the token matcher includes dots before the current period.
  const wordMatch = prefix.match(/([A-Za-z]+(?:[.][A-Za-z]+)*)$/);
  const precedingWord = wordMatch?.[1]?.toLowerCase();
  if (precedingWord && ABBREVIATIONS.has(precedingWord)) return false;
  if (precedingWord?.length === 1 && /[A-Z]/.test(next)) return false;
  return true;
}

export function splitLineIntoSentences(line) {
  const source = String(line ?? "");
  const parts = [];
  const closers = new Set(['"', "”", "’", "'", ")", "]", "}", "»"]);
  let start = 0;
  let index = 0;

  while (index < source.length) {
    const punctuation = source[index];
    if (".!?".includes(punctuation)) {
      let end = index + 1;
      while (end < source.length && ".!?".includes(source[end])) end += 1;
      while (end < source.length && closers.has(source[end])) end += 1;

      const isPeriod = punctuation === ".";
      if ((!isPeriod || isSentencePeriod(source, start, index, end)) &&
          (end === source.length || /\s/.test(source[end]))) {
        const part = source.slice(start, end).trim();
        if (part) parts.push(part);
        start = end;
        while (start < source.length && /\s/.test(source[start])) start += 1;
        index = start;
        continue;
      }
      index = end;
    } else {
      index += 1;
    }
  }

  const remainder = source.slice(start).trim();
  if (remainder) parts.push(remainder);
  return parts;
}

export function getSentences(text) {
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n");
  const result = [];
  for (const rawLine of normalized.split("\n")) {
    const line = cleanCopiedLine(rawLine);
    if (line) result.push(...splitLineIntoSentences(line));
  }
  return result;
}

export function getParagraphs(text) {
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n");
  return normalized
    .split(/\n\s*\n+/)
    .map((block) => block
      .split("\n")
      .map(cleanCopiedLine)
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean);
}

export function validateParagraphInput(text, maxCharacters = 20000, maxParagraphs = 100) {
  const value = String(text ?? "").trim();
  const paragraphs = getParagraphs(value);

  if (!value) {
    return { valid: false, code: "empty", message: "Write or paste your script before generating audio.", paragraphs: [] };
  }
  if (value.length > maxCharacters) {
    return {
      valid: false,
      code: "too_many_characters",
      message: "Please keep the script within " + maxCharacters.toLocaleString() + " characters.",
      paragraphs
    };
  }
  if (!paragraphs.length) {
    return { valid: false, code: "no_paragraphs", message: "No paragraph text was found.", paragraphs: [] };
  }
  if (paragraphs.length > maxParagraphs) {
    return {
      valid: false,
      code: "too_many_paragraphs",
      message: "This script contains " + paragraphs.length + " paragraphs. The limit is " + maxParagraphs + ".",
      paragraphs
    };
  }
  return { valid: true, code: "ok", message: "", paragraphs };
}

export function validateInput(text, maxCharacters = 20000, maxSegments = 150) {
  const value = String(text ?? "").trim();
  if (!value) {
    return { valid: false, code: "empty", message: "Paste some text before generating audio.", sentences: [] };
  }
  if (value.length > maxCharacters) {
    return {
      valid: false,
      code: "too_many_characters",
      message: "Please keep the text within " + maxCharacters.toLocaleString() + " characters.",
      sentences: []
    };
  }
  const sentences = getSentences(value);
  if (!sentences.length) {
    return { valid: false, code: "no_sentences", message: "No sentence text was found.", sentences: [] };
  }
  if (sentences.length > maxSegments) {
    return {
      valid: false,
      code: "too_many_segments",
      message: "This text creates " + sentences.length + " audio files. The limit is " + maxSegments + ".",
      sentences
    };
  }
  return { valid: true, code: "ok", message: "", sentences };
}

export function getSpeechChunks(text, maxChunkLength = 350) {
  const normalized = String(text ?? "").replaceAll("\r", " ").replaceAll("\n", " ").split(" ").filter(Boolean).join(" ");
  if (!normalized) return [];
  const limit = Math.max(80, Math.floor(Number(maxChunkLength) || 350));
  const result = [];

  for (const sentence of getSentences(normalized)) {
    let remaining = sentence;
    while (remaining.length > limit) {
      let boundary = remaining.lastIndexOf(" ", limit);
      if (boundary < Math.floor(limit * 0.55)) boundary = limit;
      const chunk = remaining.slice(0, boundary).trim();
      if (chunk) result.push(chunk);
      remaining = remaining.slice(boundary).trim();
    }
    if (remaining) result.push(remaining);
  }
  return result;
}
