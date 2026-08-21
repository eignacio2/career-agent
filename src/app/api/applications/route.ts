import { ok, serverError } from "@/lib/http";
import { countApplications, listApplications } from "@/lib/repo";
import type { ApplicationStatus } from "@/lib/types";

export const runtime = "nodejs";

const VALID: ApplicationStatus[] = [
  "prepared","awaiting_review","submitted","needs_manual_submit","failed","interviewing","rejected","offer","withdrawn",
];

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const requested = params
      .getAll("status")
      .filter((value): value is ApplicationStatus => VALID.includes(value as ApplicationStatus));

    return ok({
      applications: listApplications({ status: requested.length > 0 ? requested : undefined }),
      counts: countApplications(),
    });
  } catch (error) {
    return serverError(error);
  }
}
