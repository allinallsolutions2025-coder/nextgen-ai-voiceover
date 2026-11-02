import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanCopiedLine,
  getParagraphs,
  getSentences,
  splitLineIntoSentences,
  validateInput,
  validateParagraphInput
} from "../src/lib/text.js";

test("splits a paragraph into individual sentences", () => {
  assert.deepEqual(splitLineIntoSentences("Hello there. How are you? I am fine!"), [
    "Hello there.", "How are you?", "I am fine!"
  ]);
});

test("keeps decimal numbers together", () => {
  assert.deepEqual(splitLineIntoSentences("The result is 3.14. That is pi."), [
    "The result is 3.14.", "That is pi."
  ]);
});

test("does not split common abbreviations or initials", () => {
  assert.deepEqual(splitLineIntoSentences("Dr. A. Smith arrived. He waited."), [
    "Dr. A. Smith arrived.", "He waited."
  ]);
});

test("preserves punctuation and closing quotation marks", () => {
  assert.deepEqual(splitLineIntoSentences('She asked, "Are you ready?" Then they left.'), [
    'She asked, "Are you ready?"', "Then they left."
  ]);
});

test("treats each non-empty line as input and splits sentences", () => {
  assert.deepEqual(getSentences("First line. Second sentence.\nThird line!\n\nFourth line."), [
    "First line.", "Second sentence.", "Third line!", "Fourth line."
  ]);
});

test("unwraps quoted Python list entries", () => {
  assert.equal(cleanCopiedLine('"Hello there.",'), "Hello there.");
  assert.deepEqual(getSentences('"Hello there.",\n"How are you?",'), ["Hello there.", "How are you?"]);
});

test("decodes common escaped characters in copied string entries", () => {
  assert.equal(cleanCopiedLine('"A\\nB\\tC"'), "A\nB\tC");
});

test("rejects empty text", () => {
  assert.equal(validateInput("   ").code, "empty");
});

test("rejects input above the character limit", () => {
  const result = validateInput("12345", 4, 10);
  assert.equal(result.valid, false);
  assert.equal(result.code, "too_many_characters");
});

test("rejects more than the allowed number of sentence files", () => {
  const result = validateInput("One. Two. Three.", 100, 2);
  assert.equal(result.valid, false);
  assert.equal(result.code, "too_many_segments");
  assert.equal(result.sentences.length, 3);
});

test("accepts a valid single sentence", () => {
  const result = validateInput("A short test.", 100, 10);
  assert.equal(result.valid, true);
  assert.deepEqual(result.sentences, ["A short test."]);
});

test("splits a script into blank-line-separated paragraphs", () => {
  assert.deepEqual(getParagraphs("First paragraph.\nContinues here.\n\nSecond paragraph!\n\nThird paragraph."), [
    "First paragraph. Continues here.", "Second paragraph!", "Third paragraph."
  ]);
});

test("does not split a paragraph on a single line break", () => {
  assert.deepEqual(getParagraphs("Line one\nLine two"), ["Line one Line two"]);
});

test("validates paragraph count and keeps the full script available", () => {
  const result = validateParagraphInput("First.\n\nSecond.\n\nThird.", 100, 2);
  assert.equal(result.valid, false);
  assert.equal(result.code, "too_many_paragraphs");
  assert.equal(result.paragraphs.length, 3);
});

test("accepts a full script with multiple paragraphs", () => {
  const result = validateParagraphInput("First paragraph.\n\nSecond paragraph.", 100, 10);
  assert.equal(result.valid, true);
  assert.deepEqual(result.paragraphs, ["First paragraph.", "Second paragraph."]);
});