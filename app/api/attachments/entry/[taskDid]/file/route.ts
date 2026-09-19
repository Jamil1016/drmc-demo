import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { demoPlaceholderPath } from "@/lib/demo/attachments";

/** One attachment's bytes. In the demo every file is a generated placeholder
 *  image served from /public, so this only validates the id and redirects. */
export async function GET(req: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const url = new URL(req.url);
  const fileId = url.searchParams.get("file") ?? "";
  if (!/^[\w-]{1,80}$/.test(fileId)) return NextResponse.json({ error: "Unknown file." }, { status: 404 });
  return NextResponse.redirect(new URL(demoPlaceholderPath(fileId), url.origin), 307);
}
