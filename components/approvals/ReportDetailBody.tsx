"use client";

import type { BrowseRow } from "@/lib/hr/queries/approval-queries";
import type { ReportDetail, ReportRequirement, DayActivity } from "@/lib/hr/queries/report-detail";
import { ApproveButton } from "@/components/approvals/ApproveButton";
import { RequirementList } from "@/components/approvals/RequirementList";
import { formatZonedDateShort, formatZonedTime, formatZoned, zoneLabel } from "@/lib/time";
import { useDisplayZone } from "@/components/layout/DisplayZoneProvider";
import { PmTaskLink } from "@/components/demo/PmTaskLink";
import { approverGroupLabel } from "@/lib/hr/domain/approver-label";
import { formatApprovalLatency } from "@/lib/hr/domain/approval-latency";
import { WorkedOnThisDay } from "@/components/approvals/WorkedOnThisDay";
import { AttachmentsSection } from "@/components/approvals/AttachmentsSection";

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div className="mt-0.5 text-sm">{value || "—"}</div>
    </div>
  );
}

/** Approve / open in the project-management system. Lives under Requirements in the
 *  single-column layout; ReportDetailDrawer moves it to the top of the right
 *  column in the wide split layout. */
export function DetailActions({ row, canApprove = false, onApproved }: { row: BrowseRow; requirements?: ReportRequirement[] | null; canApprove?: boolean; onApproved?: (taskDid: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      {canApprove && row.taskStatus.toLowerCase() === "submitted" && (
        <ApproveButton taskDid={row.taskDid} onApproved={onApproved} />
      )}
      <PmTaskLink />
    </div>
  );
}

/** The report detail content, without any drawer chrome or header. Rendered by
 *  ReportDetailDrawer (browse) and by GroupPendingPanel's detail view (scorecard).
 *  `cachedRequirements` (optional) renders the Requirements section immediately
 *  from an already-fetched copy (Browse's hover prefetch cache) while the full
 *  detail is still loading; the fetched detail replaces it once it lands.
 *  `splitLayout` omits the actions row and the "Worked on this day" section —
 *  the drawer renders those in a second column when it is wide enough. */
export function ReportDetailBody({ row, detail, loading, cachedRequirements = null, cachedDayActivities = null, canApprove = false, onApproved, splitLayout = false }: { row: BrowseRow; detail: ReportDetail | null; loading: boolean; cachedRequirements?: ReportRequirement[] | null; cachedDayActivities?: DayActivity[] | null; canApprove?: boolean; onApproved?: (taskDid: string) => void; splitLayout?: boolean }) {
  // Rendered only inside client trees (drawer, scorecard panel) with callback
  // props, so the zone comes from context rather than the server cookie reader.
  const { zone } = useDisplayZone();
  const label = zoneLabel(zone);
  const requirements = detail?.requirements ?? cachedRequirements;
  // Same instant-from-prefetch trick as Requirements (Browse fills both caches
  // per page); the fetched detail replaces the cached copy once it lands.
  const dayActivities = detail?.dayActivities ?? cachedDayActivities;
  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Asset / milestone */}
      <div className="grid grid-cols-2 gap-4">
        <Meta label="Asset" value={detail?.assetName} />
        <Meta label="Milestone" value={detail?.milestone} />
      </div>

      {/* Timestamps + approver */}
      <div className="grid grid-cols-2 gap-4">
        <Meta label={`Clock in (${label})`} value={formatZonedTime(row.clockInEt, zone)} />
        <Meta label={`Submitted (${label})`} value={formatZonedDateShort(row.submittedOnEt, zone)} />
        <Meta label={`Approved (${label})`} value={formatZonedDateShort(row.approvedOnEt, zone)} />
        <Meta label="Approval latency" value={formatApprovalLatency(row.submittedOnEt, row.approvedOnEt, row.approvalLatencyDays ?? detail?.pendingWaitDays ?? null) ?? "—"} />
        <Meta label="Approver group" value={approverGroupLabel(row.assignedApprover)} />
        <Meta label="Approved by" value={row.approvedBy} />
      </div>

      {/* Requirements */}
      <section>
        <div className="side-label mb-2" style={{ color: "var(--muted)" }}>
          Requirements{requirements ? ` (${requirements.length})` : ""}
        </div>
        {loading && !requirements && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>}
        {requirements && requirements.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>No requirement lines.</p>
        )}
        {requirements && <RequirementList requirements={requirements} />}
        {!splitLayout && (
          <div className="mt-3 self-start">
            <DetailActions row={row} requirements={requirements} canApprove={canApprove} onApproved={onApproved} />
          </div>
        )}
      </section>

      {/* Attachments: thumbnails for the files behind the paperclip counts
          above. Renders nothing when the entry has no files. Keyed by task so
          switching rows never shows the previous row's images. */}
      {requirements && <AttachmentsSection key={row.taskDid} taskDid={row.taskDid} requirements={requirements} />}

      {!splitLayout && <WorkedOnThisDay dayActivities={dayActivities} loading={loading} clockInEt={row.clockInEt} statedHours={row.totalHours} memberName={row.employeeName} workDate={row.workDate} requirements={requirements} />}

      <p className="text-[11px]" style={{ color: "var(--muted-soft)" }}>
        Full timestamp: clock in {formatZoned(row.clockInEt, zone) || "—"} {label}
      </p>
    </div>
  );
}
