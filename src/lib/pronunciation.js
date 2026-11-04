function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function preserveCase(match, replacement) {
  const letters = match.match(/\\p{L}/gu) || [];
  if (letters.length > 1 && letters.every((letter) => letter.toLocaleUpperCase("en-US") === letter)) {
    return replacement.toLocaleUpperCase("en-US");
  }
  if (match[0] === match[0].toLocaleUpperCase("en-US")) {
    return replacement[0].toLocaleUpperCase("en-US") + replacement.slice(1);
  }
  return replacement;
}

export function parsePronunciationRules(source) {
  const rules = [];
  const errors = [];
  const seen = new Set();

  String(source ?? "").split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      errors.push(index + 1);
      return;
    }
    const match = line.slice(0, separator).trim();
    const replacement = line.slice(separator + 1).trim();
    if (!match || !replacement || match.length > 80 || replacement.length > 160) {
      errors.push(index + 1);
      return;
    }
    const key = match.toLocaleLowerCase("en-US");
    if (seen.has(key)) {
      errors.push(index + 1);
      return;
    }
    seen.add(key);
    rules.push({ match, replacement });
  });

  rules.sort((left, right) => right.match.length - left.match.length);
  return { rules, errors };
}

export function applyPronunciationRules(text, rulesOrSource = []) {
  const parsed = Array.isArray(rulesOrSource)
    ? { rules: rulesOrSource }
    : parsePronunciationRules(rulesOrSource);
  let result = String(text ?? "");

  for (const rule of parsed.rules) {
    const pattern = new RegExp(
      "(^|[^\\p{L}\\p{N}_])(" + escapeRegex(rule.match) + ")(?=$|[^\\p{L}\\p{N}_])",
      "giu"
    );
    result = result.replace(pattern, (_whole, prefix, matched) =>
      prefix + preserveCase(matched, rule.replacement)
    );
  }
  return result;
}
