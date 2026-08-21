import { generateLinkedInPack } from "@/lib/agent/linkedin";
import { ok, serverError } from "@/lib/http";
import {
  getLatestLinkedInPack,
  getLinkedInSnapshot,
  getProfile,
  getResume,
  insertLinkedInPack,
  listJobs,
} from "@/lib/repo";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    return ok({ pack: getLatestLinkedInPack(), snapshot: getLinkedInSnapshot() });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST() {
  try {
    const stored = getLinkedInSnapshot();
    const pack = await generateLinkedInPack(
      getProfile(),
      getResume(),
      listJobs({ limit: 60 }),
      stored?.snapshot,
    );
    return ok({ pack: insertLinkedInPack(pack) });
  } catch (error) {
    return serverError(error);
  }
}
