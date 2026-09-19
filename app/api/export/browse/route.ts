import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import type { BrowseFilters } from "@/lib/hr/queries/approval-queries";
import { sanitizeBrowseSort } from "@/lib/hr/domain/browse-sort";
import {
  browseExportRows, BROWSE_EXPORT_HEADERS,
  browseTimerExportRows, TIMER_EXPORT_HEADERS,
} from "@/lib/hr/export/browse-export";
import { csvChunks } from "@/lib/hr/export/csv-stream";

export const maxDuration = 300;

/**
 * Stream the DR Approval browse export for the current filter. Replaces the
 * lump-sum extractBrowseCsv/extractBrowseTable server actions so the client
 * can show live "N of M rows" progress while the set is fetched.
 *
 * dataset "data" (default): one row per report. dataset "timers": one row per
 * timer entry behind the filtered set (the drawer's "Worked on this day" data).
 *
 * format "csv": text/csv, byte-identical to the old action's string.
 * format "table": NDJSON for the client-side Excel builder; first line is
 * {"headers": [...]}, then one JSON array of cell values per row.
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    filters?: BrowseFilters;
    sort?: { key?: string; dir?: string };
    dataset?: string;
    format?: string;
  };
  const filters: BrowseFilters = body.filters ?? {};
  const sort = sanitizeBrowseSort(body.sort?.key, body.sort?.dir);
  const dataset = body.dataset === "timers" ? "timers" : "data";
  const format = body.format === "table" ? "table" : "csv";

  const headers = dataset === "timers" ? TIMER_EXPORT_HEADERS : BROWSE_EXPORT_HEADERS;
  const rows = dataset === "timers" ? browseTimerExportRows(filters, sort) : browseExportRows(filters, sort);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (format === "csv") {
          for await (const chunk of csvChunks(headers, rows)) {
            controller.enqueue(encoder.encode(chunk));
          }
        } else {
          controller.enqueue(encoder.encode(JSON.stringify({ headers }) + "\n"));
          for await (const cells of rows) {
            controller.enqueue(encoder.encode(JSON.stringify(cells) + "\n"));
          }
        }
        controller.close();
      } catch (e) {
        // Headers are already sent once streaming starts; aborting is the only
        // way to surface a mid-stream failure (client shows "Extract failed").
        controller.error(e);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
