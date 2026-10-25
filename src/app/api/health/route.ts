import { NextResponse } from "next/server";
import { health } from "@/lib/engine/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const checks = health(force);
  const blocking = checks.filter((c) => !c.ok);
  return NextResponse.json({
    ok: blocking.length === 0,
    checks,
    canNarrate: !checks.some((c) => !c.ok && c.critical === "narration"),
    canRender: !checks.some((c) => !c.ok && c.critical === "render"),
  });
}
