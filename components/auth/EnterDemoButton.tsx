"use client";

import { useFormStatus } from "react-dom";
import { enterDemo } from "@/app/(auth)/signin/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      data-testid="enter-demo"
      className="inline-flex h-11 items-center gap-2 rounded-md px-5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-60"
      style={{ background: "var(--signal)" }}
    >
      {pending ? "Entering…" : "Enter demo"}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/** Replaces the original single-sign-on button. One click, no credentials. */
export function EnterDemoButton() {
  return (
    <form action={enterDemo}>
      <Submit />
    </form>
  );
}
