import { NextRequest } from "next/server";

/**
 * Verify Basic Auth on incoming Deepgram callback.
 * Deepgram supports Basic Auth via the callback URL (https://user:pass@host/path).
 * We check the Authorization header matches the configured user/pass.
 *
 * Returns true if auth valid, false otherwise (including when env vars missing).
 */
export function verifyDeepgramCallbackAuth(req: NextRequest): boolean {
  const expectedUser = process.env.DEEPGRAM_CALLBACK_BASIC_AUTH_USER;
  const expectedPass = process.env.DEEPGRAM_CALLBACK_BASIC_AUTH_PASS;
  if (!expectedUser || !expectedPass) {
    console.error(
      "[deepgram/callback] auth env vars missing — rejecting all callbacks",
    );
    return false;
  }

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
  } catch {
    return false;
  }

  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  return user === expectedUser && pass === expectedPass;
}
