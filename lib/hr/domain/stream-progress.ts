/**
 * Client-side progress primitives for streamed extracts, kept pure so the
 * chunk-boundary handling is unit-testable (the same technique the ZIP
 * progress bar uses inline for PK signatures).
 */

/**
 * Cumulative counter of a byte sequence across stream chunks. Rescans a
 * `seq.length - 1` byte tail from the previous chunk so a sequence split
 * across a boundary still counts; a full window never fits inside the tail
 * alone, so nothing counts twice. Returns the running total.
 */
export function createSequenceCounter(seq: Uint8Array): (chunk: Uint8Array) => number {
  let total = 0;
  let tail = new Uint8Array(0);
  return (chunk: Uint8Array): number => {
    if (chunk.length === 0) return total;
    const buf = new Uint8Array(tail.length + chunk.length);
    buf.set(tail, 0);
    buf.set(chunk, tail.length);
    outer: for (let i = 0; i + seq.length - 1 < buf.length; i++) {
      for (let j = 0; j < seq.length; j++) {
        if (buf[i + j] !== seq[j]) continue outer;
      }
      total++;
    }
    tail = buf.slice(Math.max(0, buf.length - (seq.length - 1)));
    return total;
  };
}

/**
 * Newline-delimited JSON decoder for a byte stream: push() returns every
 * complete line seen so far (carrying partial lines and partial multi-byte
 * characters across chunks), flush() returns the final unterminated line.
 */
export function createNdjsonDecoder(): { push(chunk: Uint8Array): string[]; flush(): string[] } {
  const decoder = new TextDecoder();
  let carry = "";
  return {
    push(chunk: Uint8Array): string[] {
      carry += decoder.decode(chunk, { stream: true });
      const parts = carry.split("\n");
      carry = parts.pop() ?? "";
      return parts;
    },
    flush(): string[] {
      carry += decoder.decode();
      const last = carry;
      carry = "";
      return last.length > 0 ? [last] : [];
    },
  };
}
