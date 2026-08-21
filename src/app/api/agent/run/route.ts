import { runAgent } from "@/lib/agent/pipeline";
import { baseUrlFrom, conflict, ok, readJson, serverError } from "@/lib/http";
import { isRunInProgress } from "@/lib/repo";

export const runtime = "nodejs";
export const maxDuration = 300;

interface RunBody {
  trigger?: string;
  sendDigest?: boolean;
  refreshLinkedIn?: boolean;
  limitPerSource?: number;
}

export async function POST(request: Request) {
  try {
    if (isRunInProgress()) {
      return conflict("A run is already in progress. Wait for it to finish before starting another.");
    }

    const body = (await readJson<RunBody>(request)) ?? {};
    const result = await runAgent({
      trigger: body.trigger ?? "manual",
      appBaseUrl: baseUrlFrom(request),
      sendDigest: body.sendDigest,
      refreshLinkedIn: body.refreshLinkedIn,
      limitPerSource: body.limitPerSource,
    });

    return ok(result, { status: result.status === "failed" ? 500 : 200 });
  } catch (error) {
    return serverError(error);
  }
}
