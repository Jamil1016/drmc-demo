import { test, expect } from "playwright/test";
import { isPreviewableImage, normalizeMime, buildAttachmentItems, attachmentFileUrl } from "./attachment-preview";
import type { ReportRequirement } from "./types";

const req = (reqId: string | null, fileCount: number): ReportRequirement => ({ reqId, description: null, hours: 1, status: "Done", fileCount });

test("isPreviewableImage: browser-renderable raster MIME types only; the filename never decides", () => {
  expect(isPreviewableImage("image/png")).toBe(true);
  expect(isPreviewableImage("image/jpeg")).toBe(true);
  expect(isPreviewableImage("IMAGE/JPEG; charset=binary")).toBe(true);
  expect(isPreviewableImage("image/webp")).toBe(true);
  expect(isPreviewableImage("image/gif")).toBe(true);
  // A generic or missing type is NOT promoted by a .png filename: the /file
  // route would otherwise serve unknown bytes inline. Those become download chips.
  expect(isPreviewableImage("application/octet-stream")).toBe(false);
  expect(isPreviewableImage(null)).toBe(false);
  // Not rendered inline: PDFs, TIFF/HEIC (no cross-browser <img> support), SVG (script risk), HTML.
  expect(isPreviewableImage("application/pdf")).toBe(false);
  expect(isPreviewableImage("image/tiff")).toBe(false);
  expect(isPreviewableImage("image/heic")).toBe(false);
  expect(isPreviewableImage("image/svg+xml")).toBe(false);
  expect(isPreviewableImage("text/html")).toBe(false);
  expect(normalizeMime(" Image/PNG ; q=1")).toBe("image/png");
  expect(normalizeMime(null)).toBe("");
});

test("attachmentFileUrl encodes every segment", () => {
  expect(attachmentFileUrl("-Ox task/1", "-Oreq&", "-Ofile#")).toBe(
    "/api/attachments/entry/-Ox%20task%2F1/file?req=-Oreq%26&file=-Ofile%23",
  );
});

test("buildAttachmentItems keeps the 1-based requirement position over ALL requirements, not just the ones with files", () => {
  const reqs = [req("r1", 0), req("r2", 2), req(null, 0), req("r4", 1)];
  const listed = new Map([
    ["r2", [
      { fileId: "f1", filename: "a.png", mimeType: "image/png", fileUrl: "/u1" },
      { fileId: "f2", filename: "b.pdf", mimeType: "application/pdf", fileUrl: "/u2" },
    ]],
    ["r4", [{ fileId: "f3", filename: "c.jpg", mimeType: null, fileUrl: "/u3" }]],
  ]);
  const items = buildAttachmentItems("T1", reqs, listed);
  expect(items).toEqual([
    { reqId: "r2", reqIndex: 2, fileId: "f1", filename: "a.png", mimeType: "image/png", kind: "image", url: "/api/attachments/entry/T1/file?req=r2&file=f1" },
    { reqId: "r2", reqIndex: 2, fileId: "f2", filename: "b.pdf", mimeType: "application/pdf", kind: "pdf", url: "/api/attachments/entry/T1/file?req=r2&file=f2" },
    { reqId: "r4", reqIndex: 4, fileId: "f3", filename: "c.jpg", mimeType: null, kind: "file", url: "/api/attachments/entry/T1/file?req=r4&file=f3" },
  ]);
});

test("buildAttachmentItems: a requirement whose count is stale (no current file) contributes nothing", () => {
  const items = buildAttachmentItems("T1", [req("r1", 1)], new Map([["r1", []]]));
  expect(items).toEqual([]);
  expect(buildAttachmentItems("T1", [req("r1", 1)], new Map())).toEqual([]);
});
