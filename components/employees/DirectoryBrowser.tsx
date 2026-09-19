"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DirectoryRow } from "@/lib/hr/domain/types";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { PageHeader } from "@/components/ui/PageHeader";

/** Fields a typed query matches against (all currently visible on the list). */
function matches(row: DirectoryRow, needle: string): boolean {
  return (
    (row.reportDisplayName ?? "").toLowerCase().includes(needle) ||
    (row.fullName ?? "").toLowerCase().includes(needle) ||
    row.email.toLowerCase().includes(needle) ||
    row.empId.toLowerCase().includes(needle) ||
    (row.carrierGroup ?? "").toLowerCase().includes(needle) ||
    (row.position ?? "").toLowerCase().includes(needle) ||
    (row.immediateSupervisor ?? "").toLowerCase().includes(needle)
  );
}

/**
 * Client-side directory with search-as-you-type. The whole roster (~120 rows) is
 * loaded once by the server component and filtered in-memory here, so typing
 * filters instantly with no network round-trip and no page navigation. The header
 * count reflects the visible (filtered) rows.
 */
export function DirectoryBrowser({
  rows,
  filterNotice,
}: {
  rows: DirectoryRow[];
  filterNotice?: { label: string; clearHref: string };
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (needle ? rows.filter((r) => matches(r, needle)) : rows),
    [rows, needle],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Directory" count={filtered.length} description="Everyone at Example Co, grouped by carrier group.">
      </PageHeader>
      {filterNotice && (
        <div className="flex items-center justify-between gap-3 text-sm" style={{ color: "var(--muted)" }}>
          <span style={{ color: "var(--ink)" }}>{filterNotice.label}</span>
          <Link href={filterNotice.clearHref} className="underline" style={{ color: "var(--signal)" }}>
            Show everyone
          </Link>
        </div>
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, email, ID, group, position, supervisor"
        aria-label="Search directory"
        autoComplete="off"
        className="field w-full"
      />
      <EmployeeTable rows={filtered} />
    </div>
  );
}
