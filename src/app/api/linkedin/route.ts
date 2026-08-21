import { generateLinkedInPack } from "@/lib/agent/linkedin";
import { ok, serverError } from "@/lib/http";
import { getLatestLinkedInPack, getProfile, getResume, insertLinkedInPack, listJobs } from "@/lib/repo";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    return ok({ pack: getLatestLinkedInPack() });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST() {
  try {
    const pack = await generateLinkedInPack(getProfile(), getResume(), listJobs({ limit: 60 }));
    return ok({ pack: insertLinkedInPack(pack) });
  } catch (error) {
    return serverError(error);
  }
}
