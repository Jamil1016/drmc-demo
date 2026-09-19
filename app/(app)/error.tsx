"use client";

import AppError from "../error";

/**
 * Error boundary for the SIGNED-IN app, deliberately nested INSIDE
 * `app/(app)/layout.tsx` rather than relying on the root `app/error.tsx`.
 *
 * Why this file exists: Next nests a segment's boundary as
 * `layout > template > error > page`, so the root boundary sits ABOVE this
 * group's layout. Without this file, any server-component throw under `(app)`
 * (a statement timeout on a heavy view read, say) unmounts the whole group,
 * sidebar included, and replaces it with a bare error card.
 *
 * With this boundary the crash is contained to the page slot: the chrome and
 * any client state held above the page survive. The root `app/error.tsx`
 * stays as the outer net for `(app)/layout.tsx` itself failing (e.g. the
 * session/allowlist read throwing).
 *
 * The UI and the 60s retry behaviour are the root boundary's, reused as-is so
 * the two can never drift.
 */
export default AppError;
