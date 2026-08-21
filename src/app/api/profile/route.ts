import { badRequest, ok, readJson, serverError } from "@/lib/http";
import { getProfile, saveProfile } from "@/lib/repo";
import type { ExperienceLevel, Profile, RemotePreference } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok(getProfile());
  } catch (error) {
    return serverError(error);
  }
}

const REMOTE_VALUES: RemotePreference[] = ["remote", "hybrid", "onsite", "any"];
const LEVEL_VALUES: ExperienceLevel[] = ["new-grad", "early-career", "mid", "senior"];

function sanitize(input: Record<string, unknown>): Partial<Profile> {
  const patch: Partial<Profile> = {};

  const strings: (keyof Profile)[] = [
    "fullName","email","phone","location","headline","summary",
    "linkedinUrl","githubUrl","portfolioUrl","digestEmail",
  ];
  for (const key of strings) {
    const value = input[key as string];
    if (typeof value === "string") (patch as Record<string, unknown>)[key] = value.trim();
  }

  const lists: (keyof Profile)[] = [
    "skills","targetTitles","targetLocations","excludedCompanies","requiredKeywords","excludedKeywords",
  ];
  for (const key of lists) {
    const value = input[key as string];
    if (Array.isArray(value)) {
      (patch as Record<string, unknown>)[key] = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (typeof input.yearsExperience === "number" && Number.isFinite(input.yearsExperience)) {
    patch.yearsExperience = Math.max(0, Math.min(60, Math.round(input.yearsExperience)));
  }
  if (typeof input.autoApplyThreshold === "number" && Number.isFinite(input.autoApplyThreshold)) {
    patch.autoApplyThreshold = Math.max(0, Math.min(100, Math.round(input.autoApplyThreshold)));
  }
  if (typeof input.dailyApplicationCap === "number" && Number.isFinite(input.dailyApplicationCap)) {
    patch.dailyApplicationCap = Math.max(0, Math.min(100, Math.round(input.dailyApplicationCap)));
  }
  if (typeof input.digestHourUtc === "number" && Number.isFinite(input.digestHourUtc)) {
    patch.digestHourUtc = Math.max(0, Math.min(23, Math.round(input.digestHourUtc)));
  }
  if (input.minSalary === null) {
    patch.minSalary = null;
  } else if (typeof input.minSalary === "number" && Number.isFinite(input.minSalary)) {
    patch.minSalary = Math.max(0, Math.round(input.minSalary));
  }
  if (input.maxYearsRequired === null) {
    patch.maxYearsRequired = null;
  } else if (typeof input.maxYearsRequired === "number" && Number.isFinite(input.maxYearsRequired)) {
    patch.maxYearsRequired = Math.max(0, Math.min(30, Math.round(input.maxYearsRequired)));
  }
  if (typeof input.autopilotEnabled === "boolean") patch.autopilotEnabled = input.autopilotEnabled;
  if (typeof input.includeInternships === "boolean") patch.includeInternships = input.includeInternships;
  if (typeof input.remotePreference === "string" && REMOTE_VALUES.includes(input.remotePreference as RemotePreference)) {
    patch.remotePreference = input.remotePreference as RemotePreference;
  }
  if (typeof input.experienceLevel === "string" && LEVEL_VALUES.includes(input.experienceLevel as ExperienceLevel)) {
    patch.experienceLevel = input.experienceLevel as ExperienceLevel;
  }

  return patch;
}

export async function PATCH(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return badRequest("Expected a JSON body.");

    const patch = sanitize(body);
    if (Object.keys(patch).length === 0) return badRequest("No recognized fields to update.");

    return ok(saveProfile(patch));
  } catch (error) {
    return serverError(error);
  }
}
