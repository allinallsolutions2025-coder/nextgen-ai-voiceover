import test from "node:test";
import assert from "node:assert/strict";
import { prepareNarrationText, splitNarrationSections } from "../src/lib/narration.js";

test("normalizes years, cardinal numbers, decimals and percentages", () => {
  assert.equal(
    prepareNarrationText("In 2026, version 2.5 is 25% faster than version 1."),
    "In twenty twenty six, version two point five is twenty five percent faster than version one."
  );
});

test("speaks common currencies with major and minor units", () => {
  assert.equal(
    prepareNarrationText("It costs $12.50, £1.05, and ₹1,000."),
    "It costs twelve dollars and fifty cents, one pound and five pence, and one thousand rupees."
  );
});

test("normalizes ISO and written English dates", () => {
  assert.equal(
    prepareNarrationText("The release is 2026-11-04. The next review is Nov 5th, 2026."),
    "The release is November fourth, twenty twenty six. The next review is November fifth, twenty twenty six."
  );
});

test("speaks times, measurements and temperatures naturally", () => {
  assert.equal(
    prepareNarrationText("Meet at 5:30 pm. The device weighs 2.5 kg and runs at 72°F."),
    "Meet at five thirty in the afternoon. The device weighs two point five kilograms and runs at seventy two degrees Fahrenheit."
  );
});

test("expands common initialisms and abbreviations without changing the source", () => {
  assert.equal(
    prepareNarrationText("The AI uses an API. See e.g. the URL, PDF and FAQ."),
    "The A I uses an A P I. See for example the U R L, P D F and F A Q."
  );
});

test("keeps phone-like identifiers, version strings and URLs intact", () => {
  const source = "Call 555-123-4567. Build v2.4 is at https://example.com/v2.4.";
  assert.equal(prepareNarrationText(source), source);
});

test("splits text into paragraph sections without losing content", () => {
  assert.deepEqual(
    splitNarrationSections("First paragraph.\nContinues here.\n\nSecond paragraph!\r\n\r\nThird paragraph."),
    ["First paragraph. Continues here.", "Second paragraph!", "Third paragraph."]
  );
});

test("does not partially rewrite Indian-style comma grouping or invalid dates", () => {
  assert.equal(prepareNarrationText("The reference is 1,00,000 and the date is February 30, 2026."),
    "The reference is 1,00,000 and the date is February 30, 2026.");
  assert.equal(prepareNarrationText("The balance is ₹1,00,000."),
    "The balance is one hundred thousand rupees.");
});

test("leaves ordinary words and empty strings unchanged", () => {
  assert.equal(prepareNarrationText("Hello there."), "Hello there.");
  assert.equal(prepareNarrationText(""), "");
});
