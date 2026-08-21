import { ok, serverError } from "@/lib/http";
import { countJobs, listJobs } from "@/lib/repo";
import type { JobStatus } from "@/lib/types";

export const runtime = "nodejs";

const VALID: JobStatus[] = ["new", "shortlisted", "queued", "applied", "skipped", "expired"];

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const requested = params.getAll("status").filter((value): value is JobStatus => VALID.includes(value as JobStatus));
    const limit = Number(params.get("limit") ?? 200);

    return ok({
      jobs: listJobs({
        status: requested.length > 0 ? requested : undefined,
        limit: Number.isFinite(limit) ? Math.min(500, Math.max(1, limit)) : 200,
      }),
      counts: countJobs(),
    });
  } catch (error) {
    return serverError(error);
  }
}
