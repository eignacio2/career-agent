import { ok, serverError } from "@/lib/http";
import { listDigests } from "@/lib/repo";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok({ digests: listDigests() });
  } catch (error) {
    return serverError(error);
  }
}
