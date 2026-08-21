export type SupportedFormat = "pdf" | "docx" | "text";

export interface ExtractedDocument {
  text: string;
  format: SupportedFormat;
  pages: number | null;
  warnings: string[];
}

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFileError";
  }
}

const MAX_BYTES = 12 * 1024 * 1024;

function detectFormat(filename: string, mimeType: string): SupportedFormat {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (/\.(txt|md|markdown|text)$/.test(lower) || mimeType.startsWith("text/")) return "text";

  if (lower.endsWith(".doc")) {
    throw new UnsupportedFileError(
      "Legacy .doc files cannot be read. Open it in Word or Pages and save as .docx or PDF first.",
    );
  }
  if (lower.endsWith(".pages")) {
    throw new UnsupportedFileError(
      "Pages documents cannot be read directly. Export as PDF or Word (.docx) first.",
    );
  }
  throw new UnsupportedFileError(
    `Unsupported file type "${filename || mimeType || "unknown"}". Upload a PDF, DOCX, Markdown, or plain text file.`,
  );
}

const MONTH_NAMES =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec";

/** Labels that commonly end up glued to the preceding word by PDF extractors. */
const GLUED_LABELS = `GPA|Expected|Graduation|Present|Current|${MONTH_NAMES}`;

/**
 * Two-column resume layouts frequently extract as a single run of text, so
 * "Computer ScienceExpected Graduation" and "Chicago, ILGPA: 3.20" appear glued.
 * Only known label words are separated, since blindly splitting on a case change
 * would wreck legitimate names like JavaFX, DynamoDB, and CloudFormation.
 */
function deglue(text: string): string {
  return text
    .replace(new RegExp(`([A-Za-z,.)])(${GLUED_LABELS})\\b`, "g"), "$1 $2")
    .replace(/([A-Za-z,)])((?:19|20)\d{2})\b/g, "$1 $2");
}

function tidy(raw: string): string {
  return deglue(
    raw
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      // Collapse the letter-spaced text some PDF exporters produce.
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedDocument> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const document = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(document, { mergePages: true });
  const merged = tidy(Array.isArray(text) ? text.join("\n\n") : text);

  const warnings: string[] = [];
  if (merged.length < 200) {
    warnings.push(
      "Very little text came out of this PDF. If it is a scan or an image export, the text is not machine-readable — paste the content in manually instead.",
    );
  }

  return { text: merged, format: "pdf", pages: totalPages ?? null, warnings };
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return {
    text: tidy(result.value),
    format: "docx",
    pages: null,
    warnings: result.messages.filter((message) => message.type === "warning").slice(0, 3).map((m) => m.message),
  };
}

/** Pulls plain text out of an uploaded resume or LinkedIn profile export. */
export async function extractText(file: File): Promise<ExtractedDocument> {
  if (file.size === 0) {
    throw new UnsupportedFileError("That file is empty.");
  }
  if (file.size > MAX_BYTES) {
    throw new UnsupportedFileError(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_BYTES / 1024 / 1024}MB.`,
    );
  }

  const format = detectFormat(file.name, file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (format === "pdf") return extractPdf(bytes);
  if (format === "docx") return extractDocx(bytes);

  return {
    text: tidy(new TextDecoder().decode(bytes)),
    format: "text",
    pages: null,
    warnings: [],
  };
}
