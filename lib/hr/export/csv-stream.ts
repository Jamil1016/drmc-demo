import { csvCell } from "@/lib/csv";

/**
 * Assemble streamed CSV text chunks from a header row and an async row
 * source: the header line first, then "\r\n" + line per row, so the
 * concatenation is byte-identical to the old lump-sum
 * `[header, ...lines].join("\r\n")` (no trailing newline).
 */
export async function* csvChunks(
  headers: string[],
  rows: AsyncIterable<(string | number | null)[]>,
): AsyncGenerator<string, void, void> {
  yield headers.join(",");
  for await (const cells of rows) {
    yield "\r\n" + cells.map(csvCell).join(",");
  }
}
