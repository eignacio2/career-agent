import { extractText, UnsupportedFileError } from "@/lib/import/extract-text";
import { parseResumeText } from "@/lib/import/parse-resume";
import { badRequest, ok, serverError } from "@/lib/http";
import { getProfile, getResume, saveProfile, saveResume } from "@/lib/repo";
import type { Profile, Resume } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Parses an uploaded resume or LinkedIn profile export and returns the result
 * for review. Nothing is written until the client posts back with `confirm`.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return confirmImport(request);
    }
    if (!contentType.includes("multipart/form-data")) {
      return badRequest("Upload the file as multipart/form-data.");
    }

    const form = await request.formData();
    const file = form.get("file");
    const pasted = form.get("text");

    let sourceText: string;
    let sourceLabel: string;
    let extractionWarnings: string[] = [];

    if (file instanceof File && file.size > 0) {
      const extracted = await extractText(file);
      sourceText = extracted.text;
      sourceLabel = `${file.name} (${extracted.format}${extracted.pages ? `, ${extracted.pages} pages` : ""})`;
      extractionWarnings = extracted.warnings;
    } else if (typeof pasted === "string" && pasted.trim().length > 0) {
      sourceText = pasted;
      sourceLabel = "pasted text";
    } else {
      return badRequest("Attach a file or paste your resume text.");
    }

    const parsed = await parseResumeText(sourceText);

    return ok({
      source: sourceLabel,
      engine: parsed.engine,
      stats: parsed.stats,
      warnings: [...extractionWarnings, ...parsed.warnings],
      resume: parsed.resume,
      profileHints: parsed.profileHints,
    });
  } catch (error) {
    if (error instanceof UnsupportedFileError) return badRequest(error.message);
    return serverError(error);
  }
}

interface ConfirmBody {
  confirm: true;
  resume: Resume;
  profileHints?: Partial<Profile>;
  applyProfileHints?: boolean;
}

function isResume(value: unknown): value is Resume {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.basics === "object" &&
    record.basics !== null &&
    Array.isArray(record.experience) &&
    Array.isArray(record.skillGroups)
  );
}

/** Commits a reviewed import, merging profile fields without clobbering set values. */
async function confirmImport(request: Request) {
  const body = (await request.json()) as ConfirmBody;
  if (!body?.confirm || !isResume(body.resume)) {
    return badRequest("Expected a reviewed resume to save.");
  }

  const resume = saveResume({
    ...body.resume,
    projects: body.resume.projects ?? [],
    education: body.resume.education ?? [],
    certifications: body.resume.certifications ?? [],
  });

  let profile = getProfile();
  if (body.applyProfileHints !== false && body.profileHints) {
    const hints = body.profileHints;
    const patch: Partial<Profile> = {};

    for (const [key, value] of Object.entries(hints)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;
      (patch as Record<string, unknown>)[key] = value;
    }

    if (Object.keys(patch).length > 0) profile = saveProfile(patch);
  }

  return ok({ resume, profile });
}

export async function GET() {
  return ok({
    accepts: [".pdf", ".docx", ".md", ".txt"],
    maxSizeMb: 12,
    currentResumeName: getResume().basics.name,
  });
}
