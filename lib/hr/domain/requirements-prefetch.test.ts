import { test, expect } from "@playwright/test";
import { groupRequirementsByTask, chunkDids } from "./requirements-prefetch";

const row = (taskDid: string, reqId: string, over: Partial<{
  work_description: string | null;
  hours_worked: number | null;
  req_status: string | null;
  file_uploaded_count: number | null;
}> = {}) => ({
  task_did: taskDid,
  req_id: reqId,
  work_description: "did work",
  hours_worked: 2,
  req_status: "approved",
  file_uploaded_count: 0,
  ...over,
});

test("groups rows under their task_did, mapping to ReportRequirement shape", () => {
  const out = groupRequirementsByTask(["t1", "t2"], [
    row("t1", "r1"),
    row("t1", "r2", { hours_worked: 1.5, file_uploaded_count: 1 }),
    row("t2", "r9", { work_description: null, req_status: null }),
  ]);
  expect(out.t1).toEqual([
    { reqId: "r1", description: "did work", hours: 2, status: "approved", fileCount: 0 },
    { reqId: "r2", description: "did work", hours: 1.5, status: "approved", fileCount: 1 },
  ]);
  expect(out.t2).toEqual([
    { reqId: "r9", description: null, hours: 2, status: null, fileCount: 0 },
  ]);
});

test("every requested did gets an entry, [] when it has no rows", () => {
  const out = groupRequirementsByTask(["t1", "t2"], [row("t1", "r1")]);
  expect(out.t2).toEqual([]);
  expect(Object.keys(out).sort()).toEqual(["t1", "t2"]);
});

test("rows for dids that were not requested are ignored", () => {
  const out = groupRequirementsByTask(["t1"], [row("t1", "r1"), row("tX", "r2")]);
  expect(out.tX).toBeUndefined();
});

test("preserves row order within a task", () => {
  const out = groupRequirementsByTask(["t1"], [row("t1", "b"), row("t1", "a")]);
  expect(out.t1.map((r) => r.reqId)).toEqual(["b", "a"]);
});

test("chunkDids splits into fixed-size chunks, last chunk short", () => {
  expect(chunkDids(["a", "b", "c", "d", "e"], 2)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
});

test("chunkDids handles empty input and oversize chunk", () => {
  expect(chunkDids([], 50)).toEqual([]);
  expect(chunkDids(["a"], 50)).toEqual([["a"]]);
});
