import { getParagraphs } from "./text.js";

let nextParagraphId = 1;
const usedParagraphIds = new Set();

function createId() {
  let candidate = "paragraph-" + nextParagraphId++;
  while (usedParagraphIds.has(candidate)) candidate = "paragraph-" + nextParagraphId++;
  usedParagraphIds.add(candidate);
  return candidate;
}

function normalizeParagraphRecord(record, text) {
  const voice = typeof record?.voice === "string" && /^[ab][fm]_[a-z]+$/.test(record.voice)
    ? record.voice
    : "";
  const speed = record?.speed === "" || record?.speed === null || record?.speed === undefined
    ? ""
    : Number.isFinite(Number(record.speed)) && Number(record.speed) >= 0.5 && Number(record.speed) <= 2
      ? Number(record.speed).toFixed(2)
      : "";
  const id = typeof record?.id === "string" && record.id ? record.id : createId();
  usedParagraphIds.add(id);
  return { id, text, voice, speed };
}

/**
 * Rebuild paragraph records from the source script while preserving per-paragraph
 * voice and pace overrides for paragraphs whose text remains unchanged.
 */
export function reconcileParagraphs(text, previous = []) {
  const available = new Map();
  for (const paragraph of Array.isArray(previous) ? previous : []) {
    if (!paragraph || typeof paragraph.text !== "string") continue;
    if (!available.has(paragraph.text)) available.set(paragraph.text, []);
    available.get(paragraph.text).push(paragraph);
  }

  return getParagraphs(text).map(section => {
    const matches = available.get(section);
    const previousRecord = matches?.shift();
    return normalizeParagraphRecord(previousRecord, section);
  });
}

export function serializeParagraphs(paragraphs) {
  return (Array.isArray(paragraphs) ? paragraphs : [])
    .map(paragraph => String(paragraph?.text ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function moveParagraph(paragraphs, index, direction) {
  const result = Array.isArray(paragraphs) ? [...paragraphs] : [];
  const target = Number(index) + Number(direction);
  if (!Number.isInteger(index) || !Number.isInteger(direction) ||
      index < 0 || index >= result.length || target < 0 || target >= result.length) {
    return result;
  }
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export function splitParagraph(paragraphs, index, cursorPosition) {
  if (!Array.isArray(paragraphs) || !Number.isInteger(index) ||
      index < 0 || index >= paragraphs.length) return null;
  const source = String(paragraphs[index]?.text ?? "");
  const cursor = Number(cursorPosition);
  if (!Number.isInteger(cursor) || cursor <= 0 || cursor >= source.length) return null;

  const first = source.slice(0, cursor).trim();
  const second = source.slice(cursor).trim();
  if (!first || !second) return null;

  const original = paragraphs[index];
  const replacement = [
    { ...original, text: first },
    normalizeParagraphRecord({ voice: original.voice, speed: original.speed }, second)
  ];
  return [
    ...paragraphs.slice(0, index),
    ...replacement,
    ...paragraphs.slice(index + 1)
  ];
}

export function mergeParagraphWithNext(paragraphs, index) {
  if (!Array.isArray(paragraphs) || !Number.isInteger(index) ||
      index < 0 || index >= paragraphs.length - 1) return null;
  const current = paragraphs[index];
  const next = paragraphs[index + 1];
  return [
    ...paragraphs.slice(0, index),
    { ...current, text: [current.text, next.text].filter(Boolean).join(" ").trim() },
    ...paragraphs.slice(index + 2)
  ];
}
