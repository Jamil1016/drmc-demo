import { test, expect } from "@playwright/test";
import { approverGroupLabel } from "./approver-label";

test("strips the Daily Report Approvers prefix", () => {
  expect(approverGroupLabel("Daily Report Approvers - Group A")).toBe("Group A");
  expect(approverGroupLabel("Daily Report Approvers - Operations Support (OPS)"))
    .toBe("Operations Support (OPS)");
});

test("leaves names without the prefix untouched", () => {
  expect(approverGroupLabel("Noor Haddad")).toBe("Noor Haddad");
  expect(approverGroupLabel("Team 2 - Group A - Carrier A Team")).toBe("Team 2 - Group A - Carrier A Team");
});

test("null-safe and never returns an empty label", () => {
  expect(approverGroupLabel(null)).toBeNull();
  expect(approverGroupLabel("Daily Report Approvers - ")).toBe("Daily Report Approvers - ");
});
