import { NextResponse } from "next/server";

import { runAgent } from "@/lib/agent/pipeline";
import { baseUrlFrom, ok, serverError } from "@/lib/http";
import { isRunInProgress } from "@/lib/repo";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Scheduler entry point. Point cron, a GitHub Action, or a platform scheduler at
 * this route once a day. When CRON_SECRET is set the request must carry it as a
 * bearer token or a `?token=` query parameter.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const url = new URL(request.url);
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const provided = bearer ?? url.searchParams.get("token") ?? "";
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    if (isRunInProgress()) {
      return NextResponse.json({ skipped: true, reason: "A run is already in progress." }, { status: 202 });
    }

    const result = await runAgent({
      trigger: "scheduled",
      appBaseUrl: baseUrlFrom(request),
      sendDigest: true,
      refreshLinkedIn: true,
    });

    return ok(result, { status: result.status === "failed" ? 500 : 200 });
  } catch (error) {
    return serverError(error);
  }
}

export const GET = handle;
export const POST = handle;
