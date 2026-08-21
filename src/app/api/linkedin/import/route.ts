import { extractText, UnsupportedFileError } from "@/lib/import/extract-text";
import { looksLikeLinkedInExport, parseLinkedInSnapshot } from "@/lib/import/linkedin";
import { badRequest, ok, serverError } from "@/lib/http";
import { getLinkedInSnapshot, saveLinkedInSnapshot, saveProfile } from "@/lib/repo";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    return ok({ stored: getLinkedInSnapshot() });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * Accepts a LinkedIn profile printed to PDF (More → Save to PDF, or the browser's
 * own print dialog) and stores it so recommendations can name what to change.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return badRequest("Upload the LinkedIn PDF as multipart/form-data.");
    }

    const form = await request.formData();
    const file = form.get("file");
    const pasted = form.get("text");

    let raw: string;
    if (file instanceof File && file.size > 0) {
      raw = (await extractText(file)).text;
    } else if (typeof pasted === "string" && pasted.trim().length > 0) {
      raw = pasted;
    } else {
      return badRequest("Attach your LinkedIn PDF or paste the profile text.");
    }

    const snapshot = parseLinkedInSnapshot(raw);
    const warnings: string[] = [];

    if (!looksLikeLinkedInExport(raw)) {
      warnings.push(
        "This does not look like a LinkedIn profile export. It was still read, but check the fields below carefully.",
      );
    }
    if (!snapshot.headline) warnings.push("No headline could be identified.");
    if (!snapshot.about) warnings.push("No About section was found.");
    if (!snapshot.hasExperienceSection) {
      warnings.push(
        "Your profile appears to have no Experience section. That is the single biggest thing to fix — recruiter search filters on job titles held.",
      );
    }

    const stored = saveLinkedInSnapshot(snapshot);

    // Only fill the profile URL, since everything else is better taken from the resume.
    const patch: Partial<Profile> = {};
    if (snapshot.profileUrl) patch.linkedinUrl = snapshot.profileUrl;
    if (Object.keys(patch).length > 0) saveProfile(patch);

    return ok({ snapshot: stored.snapshot, capturedAt: stored.capturedAt, warnings });
  } catch (error) {
    if (error instanceof UnsupportedFileError) return badRequest(error.message);
    return serverError(error);
  }
}
