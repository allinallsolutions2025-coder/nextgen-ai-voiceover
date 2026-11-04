import test from "node:test";
import assert from "node:assert/strict";
import { applyPronunciationRules, parsePronunciationRules } from "../src/lib/pronunciation.js";

test("parses custom pronunciation rules and ignores comments", () => {
  const parsed = parsePronunciationRules("# Brand names\nOpenAI = Open A I\nSQL = sequel");
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rules, [
    { match: "OpenAI", replacement: "Open A I" },
    { match: "SQL", replacement: "sequel" }
  ]);
});

test("applies replacements case-insensitively while preserving word boundaries", () => {
  const parsed = parsePronunciationRules("OpenAI = Open A I\nAI = A I");
  const output = applyPronunciationRules("OpenAI builds AI tools. NotRAIN.", parsed.rules);
  assert.equal(output, "Open A I builds A I tools. NotRAIN.");
});

test("applies phrase rules and basic capitalization", () => {
  const parsed = parsePronunciationRules("YouTube = You Tube\nMrBeast = Mister Beast");
  assert.equal(applyPronunciationRules("YouTube and MRBEAST", parsed.rules), "You Tube and MISTER BEAST");
});

test("escapes punctuation in the source phrase", () => {
  const parsed = parsePronunciationRules("C++ = C plus plus");
  assert.equal(applyPronunciationRules("I use C++ daily.", parsed.rules), "I use C plus plus daily.");
});

test("reports malformed and duplicate lines without silently accepting them", () => {
  const parsed = parsePronunciationRules("OpenAI = Open A I\nmissing replacement\nOpenAI = O P E N A I\n= empty source");
  assert.deepEqual(parsed.errors, [2, 3, 4]);
  assert.deepEqual(parsed.rules, [{ match: "OpenAI", replacement: "Open A I" }]);
});

test("does not change input when no rules are supplied", () => {
  assert.equal(applyPronunciationRules("Hello, world!"), "Hello, world!");
});
