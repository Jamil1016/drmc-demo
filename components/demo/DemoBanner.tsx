import { DEMO_BANNER_TEXT } from "@/lib/demo/mode";

/** Persistent notice on every page of the demo, signed in or not. */
export function DemoBanner() {
  return (
    <div
      role="note"
      data-testid="demo-banner"
      className="px-5 py-2 text-[12.5px] leading-snug md:px-8"
      style={{
        background: "color-mix(in srgb, var(--accent) 14%, var(--card))",
        borderBottom: "1px solid color-mix(in srgb, var(--accent) 45%, var(--rule))",
        color: "var(--ink)",
      }}
    >
      <strong className="font-semibold">Demo data.</strong>{" "}
      {DEMO_BANNER_TEXT.replace(/^Demo data\.\s*/, "")}
    </div>
  );
}
