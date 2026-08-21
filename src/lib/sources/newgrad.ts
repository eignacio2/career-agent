import { fetchJson, type JobSource, type SourceJob } from "./types";

interface NewGradListing {
  id: string;
  title: string;
  company_name: string;
  company_url?: string;
  locations?: string[];
  url: string;
  /** Unix seconds. */
  date_posted?: number;
  date_updated?: number;
  active?: boolean;
  is_visible?: boolean;
  category?: string;
  degrees?: string[];
  sponsorship?: string;
  source?: string;
}

const FEED_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json";

const MAX_AGE_DAYS = 75;
// The feed is a single large document, so it needs a longer budget than an API.
const FETCH_TIMEOUT_MS = 45_000;

function isRecent(listing: NewGradListing): boolean {
  const stamp = listing.date_updated ?? listing.date_posted;
  if (!stamp) return true;
  const ageDays = (Date.now() / 1000 - stamp) / 86_400;
  return ageDays <= MAX_AGE_DAYS;
}

function matchesQuery(title: string, queries: string[]): boolean {
  const lowered = title.toLowerCase();
  return queries.some((query) => {
    const needle = query.toLowerCase().trim();
    if (needle.length === 0) return false;
    if (lowered.includes(needle)) return true;
    // Match on the significant words so "Data Scientist I" also catches
    // "Data Scientist, Growth" and "New College Grad Data Scientist".
    const words = needle.split(/\s+/).filter((word) => word.length > 3);
    return words.length > 1 && words.every((word) => lowered.includes(word));
  });
}

/**
 * Community-maintained board of new-graduate openings, which is where entry-level
 * postings actually live. General remote-job aggregators skew heavily senior, so
 * without this source an early-career search finds almost nothing worth applying to.
 */
export const newGradSource: JobSource = {
  id: "newgrad-board",
  label: "New Grad Positions board",
  requiresNetwork: true,

  async fetch(queries, limit) {
    const listings = await fetchJson<NewGradListing[]>(FEED_URL, FETCH_TIMEOUT_MS);
    if (!Array.isArray(listings)) return [];

    const results: SourceJob[] = [];

    for (const listing of listings) {
      if (listing.active === false || listing.is_visible === false) continue;
      if (!listing.title || !listing.url) continue;
      if (!isRecent(listing)) continue;
      if (!matchesQuery(listing.title, queries)) continue;

      const locations = listing.locations ?? [];
      const locationText = locations.join(" · ");
      const remote = /remote|anywhere/i.test(locationText);

      results.push({
        source: "newgrad-board",
        sourceId: listing.id || `${listing.company_name}-${listing.title}`,
        title: listing.title,
        company: listing.company_name || "Unknown company",
        location: locationText || "Not stated",
        remote,
        url: listing.url,
        // These listings link straight to an ATS form, never an email address.
        applyEmail: null,
        // The feed carries no description; the title and metadata are all there is.
        description: "",
        salaryText: null,
        tags: [
          ...(listing.category ? [listing.category] : []),
          ...(listing.degrees ?? []),
          ...(listing.sponsorship && listing.sponsorship !== "Other" ? [listing.sponsorship] : []),
        ].slice(0, 12),
        postedAt: listing.date_posted ? new Date(listing.date_posted * 1000).toISOString() : null,
        // Every posting on this board is curated as an entry-level opening.
        earlyCareer: true,
      });

      if (results.length >= limit) break;
    }

    return results;
  },
};
