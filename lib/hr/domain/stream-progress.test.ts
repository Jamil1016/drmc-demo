import { test, expect } from "@playwright/test";
import { createSequenceCounter, createNdjsonDecoder } from "./stream-progress";

const enc = new TextEncoder();
const CRLF = new Uint8Array([0x0d, 0x0a]);

test("sequence counter: counts occurrences within one chunk", () => {
  const count = createSequenceCounter(CRLF);
  expect(count(enc.encode("a\r\nb\r\nc"))).toBe(2);
});

test("sequence counter: sequence split across chunk boundary is counted once", () => {
  const count = createSequenceCounter(CRLF);
  expect(count(enc.encode("row1\r"))).toBe(0);
  expect(count(enc.encode("\nrow2"))).toBe(1);
});

test("sequence counter: back-to-back occurrences all count", () => {
  const count = createSequenceCounter(CRLF);
  expect(count(enc.encode("\r\n\r\n\r\n"))).toBe(3);
});

test("sequence counter: no occurrence and empty chunks", () => {
  const count = createSequenceCounter(CRLF);
  expect(count(enc.encode("plain text, bare \n only"))).toBe(0);
  expect(count(new Uint8Array(0))).toBe(0);
});

test("sequence counter: carry does not double-count across many chunks", () => {
  const count = createSequenceCounter(CRLF);
  const text = "a\r\nb\r\nc\r\nd";
  const bytes = enc.encode(text);
  let total = 0;
  // Feed one byte at a time: worst-case boundary splitting.
  for (const b of bytes) total = count(new Uint8Array([b]));
  expect(total).toBe(3);
});

test("ndjson decoder: complete lines per chunk", () => {
  const d = createNdjsonDecoder();
  expect(d.push(enc.encode('{"a":1}\n[1,2]\n'))).toEqual(['{"a":1}', "[1,2]"]);
  expect(d.flush()).toEqual([]);
});

test("ndjson decoder: line split across chunks reassembles", () => {
  const d = createNdjsonDecoder();
  expect(d.push(enc.encode('["hel'))).toEqual([]);
  expect(d.push(enc.encode('lo"]\n["world"]\n'))).toEqual(['["hello"]', '["world"]']);
});

test("ndjson decoder: multi-byte character split across chunks survives", () => {
  const d = createNdjsonDecoder();
  const bytes = enc.encode('["héllo"]\n');
  // Split inside the two-byte é sequence.
  const cut = 5;
  d.push(bytes.slice(0, cut));
  const lines = d.push(bytes.slice(cut));
  expect(lines).toEqual(['["héllo"]']);
});

test("ndjson decoder: flush returns a trailing unterminated line", () => {
  const d = createNdjsonDecoder();
  expect(d.push(enc.encode('["a"]\n["tail"'))).toEqual(['["a"]']);
  expect(d.flush()).toEqual(['["tail"']);
});
