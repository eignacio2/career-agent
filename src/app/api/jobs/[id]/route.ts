import { tailorApplication } from "@/lib/agent/tailor";
import { channelFor } from "@/lib/agent/apply";
import { badRequest, notFound, ok, readJson, serverError } from "@/lib/http";
import { getJob, getProfile, getResume, updateJobStatus, upsertApplication } from "@/lib/repo";
import type { JobStatus } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID: JobStatus[] = ["new", "shortlisted", "queued", "applied", "skipped", "expired"];

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const job = getJob(Number(id));
    return job ? ok(job) : notFound("No such job.");
  } catch (error) {
    return serverError(error);
  }
}

interface PatchBody {
  status?: JobStatus;
  /** When true, tailors a resume and cover letter and queues the job for review. */
  prepare?: boolean;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const job = getJob(Number(id));
    if (!job) return notFound("No such job.");

    const body = (await readJson<PatchBody>(request)) ?? {};

    if (body.prepare) {
      const profile = getProfile();
      const resume = getResume();
      const tailored = await tailorApplication(job, profile, resume);
      const application = upsertApplication({
        jobId: job.id,
        status: "awaiting_review",
        channel: channelFor(job),
        resumeMarkdown: tailored.resumeMarkdown,
        coverLetter: tailored.coverLetter,
        tailoringNotes: tailored.notes,
        notes: "Prepared on request from the jobs list.",
      });
      updateJobStatus(job.id, "queued");
      return ok({ job: getJob(job.id), application });
    }

    if (body.status) {
      if (!VALID.includes(body.status)) return badRequest("Unrecognized status.");
      updateJobStatus(job.id, body.status);
      return ok({ job: getJob(job.id) });
    }

    return badRequest("Provide a status or set prepare to true.");
  } catch (error) {
    return serverError(error);
  }
}
