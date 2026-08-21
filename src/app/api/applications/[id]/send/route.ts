import { submitByEmail } from "@/lib/agent/apply";
import { badRequest, notFound, ok, serverError } from "@/lib/http";
import { getApplication, getProfile, updateApplication, updateJobStatus } from "@/lib/repo";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Sends an already-prepared email application after the user approves it. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const application = getApplication(Number(id));
    if (!application) return notFound("No such application.");
    if (!application.job) return notFound("The linked posting is missing.");

    if (application.channel !== "email") {
      return badRequest(
        "This posting only accepts applications through its own form. Open the posting, paste the prepared pack, then mark it submitted.",
      );
    }
    if (application.status === "submitted") {
      return badRequest("This application has already been sent.");
    }

    const outcome = await submitByEmail(application.job, getProfile(), application);

    if (outcome.submitted) {
      const updated = updateApplication(application.id, {
        status: "submitted",
        submittedAt: new Date().toISOString(),
        notes: outcome.message,
        error: null,
      });
      updateJobStatus(application.jobId, "applied");
      return ok({ application: updated, sent: true, message: outcome.message });
    }

    const updated = updateApplication(application.id, {
      notes: outcome.message,
      error: outcome.result?.error ?? null,
    });
    return ok({ application: updated, sent: false, message: outcome.message });
  } catch (error) {
    return serverError(error);
  }
}
