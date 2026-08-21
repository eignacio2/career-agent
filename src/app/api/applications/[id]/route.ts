import { badRequest, notFound, ok, readJson, serverError } from "@/lib/http";
import { getApplication, updateApplication, updateJobStatus } from "@/lib/repo";
import type { Application, ApplicationStatus } from "@/lib/types";

export const runtime = "nodejs";

const VALID: ApplicationStatus[] = [
  "prepared","awaiting_review","submitted","needs_manual_submit","failed","interviewing","rejected","offer","withdrawn",
];

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const application = getApplication(Number(id));
    return application ? ok(application) : notFound("No such application.");
  } catch (error) {
    return serverError(error);
  }
}

interface PatchBody {
  status?: ApplicationStatus;
  notes?: string;
  coverLetter?: string;
  resumeMarkdown?: string;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const existing = getApplication(Number(id));
    if (!existing) return notFound("No such application.");

    const body = await readJson<PatchBody>(request);
    if (!body) return badRequest("Expected a JSON body.");

    const patch: Partial<Application> = {};
    if (body.status) {
      if (!VALID.includes(body.status)) return badRequest("Unrecognized status.");
      patch.status = body.status;
      if (body.status === "submitted" && !existing.submittedAt) {
        patch.submittedAt = new Date().toISOString();
      }
    }
    if (typeof body.notes === "string") patch.notes = body.notes;
    if (typeof body.coverLetter === "string") patch.coverLetter = body.coverLetter;
    if (typeof body.resumeMarkdown === "string") patch.resumeMarkdown = body.resumeMarkdown;

    const updated = updateApplication(existing.id, patch);

    if (patch.status === "submitted") updateJobStatus(existing.jobId, "applied");
    if (patch.status === "withdrawn") updateJobStatus(existing.jobId, "skipped");

    return ok(updated);
  } catch (error) {
    return serverError(error);
  }
}
