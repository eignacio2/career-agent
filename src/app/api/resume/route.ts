import { badRequest, ok, readJson, serverError } from "@/lib/http";
import { getResume, saveResume } from "@/lib/repo";
import { renderResumeMarkdown } from "@/lib/resume-render";
import type { Resume } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const resume = getResume();
    if (new URL(request.url).searchParams.get("format") === "markdown") {
      return new Response(renderResumeMarkdown(resume), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${resume.basics.name.replace(/\s+/g, "-").toLowerCase() || "resume"}.md"`,
        },
      });
    }
    return ok(resume);
  } catch (error) {
    return serverError(error);
  }
}

function isResume(value: unknown): value is Resume {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.basics === "object" &&
    record.basics !== null &&
    Array.isArray(record.experience) &&
    Array.isArray(record.skillGroups) &&
    Array.isArray(record.projects) &&
    Array.isArray(record.education) &&
    Array.isArray(record.certifications)
  );
}

export async function PUT(request: Request) {
  try {
    const body = await readJson<unknown>(request);
    if (!isResume(body)) return badRequest("Expected a full resume object.");
    return ok(saveResume(body));
  } catch (error) {
    return serverError(error);
  }
}
