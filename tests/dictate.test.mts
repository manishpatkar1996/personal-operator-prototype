import assert from "node:assert/strict";
import test from "node:test";
import { appendDictateTranscript, dictateErrorMessage, formatDictateClock } from "../lib/operator/dictate.ts";

test("dictate clock starts at 0:00 and pads seconds", () => {
  assert.equal(formatDictateClock(0), "0:00");
  assert.equal(formatDictateClock(999), "0:00");
  assert.equal(formatDictateClock(1000), "0:01");
  assert.equal(formatDictateClock(12_000), "0:12");
  assert.equal(formatDictateClock(61_000), "1:01");
});

test("dictate errors stay recoverable and specific", () => {
  assert.match(dictateErrorMessage("not-allowed"), /blocked/i);
  assert.match(dictateErrorMessage("no-speech"), /No speech/);
  assert.match(dictateErrorMessage("whisper-unavailable"), /OpenAI key/);
});

test("append transcript avoids extra spaces", () => {
  assert.equal(appendDictateTranscript("", "  Hello "), "Hello");
  assert.equal(appendDictateTranscript("Hello", "world"), "Hello world");
  assert.equal(appendDictateTranscript("Hello ", "  "), "Hello ");
});
