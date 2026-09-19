import { test, expect } from "@playwright/test";
import { csvChunks } from "./csv-stream";
import { csvCell } from "@/lib/csv";

async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const i of items) yield i;
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const chunk of gen) out += chunk;
  return out;
}

test("streamed output is byte-identical to the old join(\\r\\n) form", async () => {
  const headers = ["A", "B", "C"];
  const rows: (string | number | null)[][] = [
    ["plain", 1, null],
    ['with "quotes"', 2.5, "multi\nline"],
    ["=formula", -3, "comma, cell"],
  ];
  const old = [headers.join(","), ...rows.map((cells) => cells.map(csvCell).join(","))].join("\r\n");
  const streamed = await collect(csvChunks(headers, fromArray(rows)));
  expect(streamed).toBe(old);
});

test("zero rows yields just the header line with no trailing newline", async () => {
  const streamed = await collect(csvChunks(["X", "Y"], fromArray([])));
  expect(streamed).toBe("X,Y");
});
