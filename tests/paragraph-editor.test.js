import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeParagraphWithNext,
  moveParagraph,
  reconcileParagraphs,
  serializeParagraphs,
  splitParagraph
} from "../src/lib/paragraph-editor.js";

test("reconciles edited scripts while preserving settings for unchanged paragraphs", () => {
  const previous = [
    { id: "para-a", text: "First paragraph.", voice: "af_heart", speed: "1.15" },
    { id: "para-b", text: "Second paragraph.", voice: "", speed: "" }
  ];
  const result = reconcileParagraphs("Second paragraph.\n\nFirst paragraph.\n\nNew paragraph.", previous);
  assert.deepEqual(result.map(item => item.text), ["Second paragraph.", "First paragraph.", "New paragraph."]);
  assert.equal(result[0].id, "para-b");
  assert.equal(result[1].voice, "af_heart");
  assert.equal(result[1].speed, "1.15");
  assert.equal(result[2].voice, "");
});

test("serializes paragraphs with a blank line between sections", () => {
  assert.equal(serializeParagraphs([
    { text: "  First paragraph.  " },
    { text: "Second paragraph." },
    { text: "" }
  ]), "First paragraph.\n\nSecond paragraph.");
});

test("moves paragraphs up and down without losing paragraph settings", () => {
  const original = [
    { id: "a", text: "A", voice: "af_heart" },
    { id: "b", text: "B", voice: "bf_emma" },
    { id: "c", text: "C", voice: "" }
  ];
  const moved = moveParagraph(original, 1, -1);
  assert.deepEqual(moved.map(item => item.id), ["b", "a", "c"]);
  assert.equal(moved[0].voice, "bf_emma");
  assert.deepEqual(moveParagraph(moved, 0, -1), moved);
  assert.deepEqual(moveParagraph(moved, 2, 1), moved);
});

test("splits at the selected cursor while inheriting paragraph voice and pace", () => {
  const original = [{ id: "a", text: "First sentence. Second sentence.", voice: "bf_emma", speed: "1.20" }];
  const split = splitParagraph(original, 0, 16);
  assert.deepEqual(split.map(item => item.text), ["First sentence.", "Second sentence."]);
  assert.equal(split[0].id, "a");
  assert.equal(split[1].voice, "bf_emma");
  assert.equal(split[1].speed, "1.20");
  assert.equal(splitParagraph(original, 0, 0), null);
  assert.equal(splitParagraph(original, 0, original[0].text.length), null);
});

test("merges with the next paragraph and preserves the leading paragraph settings", () => {
  const original = [
    { id: "a", text: "First sentence.", voice: "af_heart", speed: "0.90" },
    { id: "b", text: "Second sentence.", voice: "bf_emma", speed: "1.20" }
  ];
  const merged = mergeParagraphWithNext(original, 0);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "First sentence. Second sentence.");
  assert.equal(merged[0].voice, "af_heart");
  assert.equal(merged[0].speed, "0.90");
  assert.equal(mergeParagraphWithNext(original, 1), null);
});

test("rejects unsupported persisted voice and pace overrides", () => {
  const result = reconcileParagraphs("Keep defaults.", [
    { id: "saved", text: "Keep defaults.", voice: "zf_xiaoyi", speed: "5.00" }
  ]);
  assert.equal(result[0].voice, "");
  assert.equal(result[0].speed, "");
});
