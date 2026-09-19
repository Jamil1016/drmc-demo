"use client";

import { stopPreview } from "@/app/(app)/actions";

/** Slim full-width notice shown while a super_admin is previewing another
 *  user's session. Read-only: the words "read only" carry the meaning (no
 *  color-only signal). Exit posts straight to the stopPreview server action. */
export function PreviewBanner({ targetLabel, targetRole }: { targetLabel: string; targetRole: string }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-2 md:px-8"
      style={{ background: "#fdf0d9", borderBottom: "1px solid var(--warn)", color: "var(--warn)" }}
    >
      <span className="text-sm font-medium">
        Viewing as {targetLabel} · {targetRole} · read only
      </span>
      <form action={stopPreview}>
        <button
          type="submit"
          className="rounded-md px-3 py-1 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--warn)]"
          style={{ border: "1px solid var(--warn)", color: "var(--warn)", background: "transparent" }}
        >
          Exit preview
        </button>
      </form>
    </div>
  );
}
