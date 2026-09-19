/**
 * Read the `exp` claim (JWT expiry, seconds since epoch) and return it in
 * milliseconds, or null if the token has no numeric exp or is not a JWT. No
 * signature verification (we just obtained this token ourselves). Never
 * throws: a missing/garbled exp just means "don't cache".
 */
export function decodeExpMs(idToken: string): number | null {
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
