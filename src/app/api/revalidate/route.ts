import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

/**
 * Lets the desktop app expire this site's cached pages after it syncs changes into the
 * shared database (those writes bypass our server actions, so nothing else would expire them).
 *
 * POST /api/revalidate  { "tags": ["stats", "views", "topic:3", "problem:42"] }
 * Authorization: Bearer <REVALIDATE_SECRET>
 */
const TAG = /^(stats|views|topic:\d+|problem:\d+)$/;

function authorized(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t): t is string => typeof t === "string" && TAG.test(t)) : [];
  if (tags.length === 0 || tags.length > 500) return Response.json({ error: "bad tags" }, { status: 400 });

  for (const t of new Set(tags)) revalidateTag(t, { expire: 0 });
  return Response.json({ revalidated: tags.length });
}
