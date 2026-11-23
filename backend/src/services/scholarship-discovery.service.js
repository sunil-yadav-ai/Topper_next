import Scholarship from "../models/Scholarship.js";
import ScholarshipSource from "../models/ScholarshipSource.js";
import { extractUgcEligibilityRules, normalizeSlug } from "./scholarship.service.js";

const NSP_URL = "https://scholarships.gov.in/All-Scholarships";
const NSP_LOGIN_URL = "https://scholarships.gov.in/";
const UGC_STUDENT_URL = "https://www.ugc.gov.in/Home/student_Corner";
const UGC_FRG_URL = "https://frg.ugc.ac.in/";
const UGC_SOURCE_NAME = "University Grants Commission";
const UGC_FRG_SOURCE_NAME = "UGC Fellowship and Research Grants";

const sourceDefinitions = [
  {
    name: "National Scholarship Portal",
    url: NSP_URL,
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "national",
    collectorKey: "nsp",
    enabled: true,
    monitoringStatus: "active",
  },
  {
    name: UGC_SOURCE_NAME,
    url: UGC_STUDENT_URL,
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "national",
    collectorKey: "ugc-student-corner",
    enabled: true,
    monitoringStatus: "active",
  },
  {
    name: UGC_FRG_SOURCE_NAME,
    url: UGC_FRG_URL,
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "research",
    collectorKey: "ugc-frg",
    enabled: true,
    monitoringStatus: "active",
  },
  {
    name: "AICTE",
    url: "https://www.aicte-india.org/",
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "national",
    collectorKey: "aicte",
    enabled: true,
    monitoringStatus: "not_integrated",
    limitation: "The official site could not be reached from this environment; no records are imported from secondary sources as AICTE records.",
  },
  {
    name: "Ministry of Tribal Affairs",
    url: "https://tribal.nic.in/Scholarship.aspx",
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "national",
    collectorKey: "tribal-affairs",
    enabled: true,
    monitoringStatus: "not_integrated",
    limitation: "The official page uses a TLS configuration not accepted by the collector runtime; the check will not disable certificate validation.",
  },
  {
    name: "Ministry of Education",
    url: "https://www.education.gov.in/scholarships",
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "national",
    collectorKey: "ministry-of-education",
    enabled: true,
    monitoringStatus: "restricted",
    limitation: "The official scholarships page returned HTTP 403 to the public fetcher; no data is imported from secondary sources.",
  },
  {
    name: "Ministry of Social Justice and Empowerment",
    url: "https://socialjustice.gov.in/schemes/25",
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "national",
    collectorKey: "social-justice",
    enabled: true,
    monitoringStatus: "unavailable",
    limitation: "The official page returned HTTP 503 during the access check; no scholarship records are inferred from the error page.",
  },
  {
    name: "Uttar Pradesh Scholarship & Fee Reimbursement System",
    url: "https://scholarship.up.gov.in/",
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "state",
    state: "Uttar Pradesh",
    collectorKey: "up-scholarship",
    enabled: true,
    monitoringStatus: "not_integrated",
    limitation: "The official portal uses a TLS configuration not accepted by the collector runtime; no application status is inferred from its timetable.",
  },
  {
    name: "MahaDBT",
    url: "https://mahadbt2.maharashtra.gov.in/",
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "state",
    state: "Maharashtra",
    collectorKey: "mahadbt",
    enabled: true,
    monitoringStatus: "not_integrated",
    limitation: "The public page does not expose a documented scholarship listing feed; scheme records are not inferred from portal code or login workflows.",
  },
  {
    name: "Odisha State Scholarship Portal",
    url: "https://scholarship.odisha.gov.in/",
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "state",
    state: "Odisha",
    collectorKey: "odisha-scholarship",
    enabled: true,
    monitoringStatus: "restricted",
    limitation: "The public page is an application shell; its data service uses portal-specific encrypted requests and is not treated as a public feed.",
  },
  {
    name: "Punjab Government",
    url: "https://punjab.gov.in/",
    sourceType: "website",
    authorityType: "government",
    sourceCategory: "state",
    state: "Punjab",
    collectorKey: "punjab-scholarship",
    enabled: true,
    monitoringStatus: "not_integrated",
    limitation: "The supplied official domain did not expose a scholarship listing page; no scholarship records are inferred from it.",
  },
  {
    name: "Buddy4Study (secondary aggregator)",
    url: "https://www.buddy4study.com/scholarships",
    sourceType: "website",
    authorityType: "private",
    sourceCategory: "private",
    collectorKey: "buddy4study",
    enabled: false,
    monitoringStatus: "disabled",
    limitation: "This is an aggregator, not the awarding organization; its listings are excluded from verified primary-source records.",
  },
  {
    name: "SBI Foundation Asha Scholarship",
    url: "https://www.sbifoundation.org/asha-scholarship",
    sourceType: "website",
    authorityType: "foundation",
    sourceCategory: "corporate",
    collectorKey: "sbi-foundation-asha",
    enabled: false,
    monitoringStatus: "disabled",
    limitation: "The public page currently renders legacy 2024 application links; no current application window was verified, so it is not imported as open.",
  },
];

function decodeHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#0*39;/g, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value, isEndOfDay = true) {
  const match = String(value || "").match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return null;
  const date = new Date(`${match[3]}-${match[2]}-${match[1]}T${isEndOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stripHtml(value = "") {
  return decodeHtml(String(value).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
}

function extractUgcField(html, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(
    `<span[^>]*>\\s*${escapedLabel}\\s*:?\\s*<\\/span>[\\s\\S]*?<div class=["']col-md-9 info["'][^>]*>([\\s\\S]*?)<\\/div>`,
    "i",
  ));
  return match ? stripHtml(match[1]) : "";
}

export function parseUgcStudentListings(html) {
  const listings = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const href = row.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1];
    if (!href || !/\/(?:Scholarships|Fellowship)\/stu_/i.test(href)) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    const title = stripHtml(cells[1]?.[1] ?? "");
    if (!title) continue;
    const fellowship = /\/Fellowship\//i.test(href);
    listings.push({
      title,
      url: new URL(href, "https://www.ugc.gov.in").href,
      kind: fellowship ? "fellowship" : "scholarship",
    });
  }
  return listings;
}

export function parseUgcScholarshipDetails(html) {
  return {
    title: extractUgcField(html, "Name of the Scheme"),
    description: extractUgcField(html, "Objective of Scheme") || extractUgcField(html, "Objective"),
    eligibility: extractUgcField(html, "Eligibility"),
    slots: extractUgcField(html, "Slots"),
    tenure: extractUgcField(html, "Tenure"),
    assistance: extractUgcField(html, "Financial Assistance"),
  };
}

export function parseUgcFrgOpportunities(html, now = new Date()) {
  const opportunities = [];
  const headingRegex = /<h5[^>]*>([\s\S]*?)<\/h5>/gi;
  const headings = [...html.matchAll(headingRegex)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const cardStart = html.lastIndexOf('class="col-md-4 col-xs-12 plr10', heading.index);
    if (cardStart < 0) continue;
    const cardPrefix = html.slice(cardStart, heading.index);
    if (/style=["'][^"']*display\s*:\s*none/i.test(cardPrefix)) continue;
    const cardEnd = headings[index + 1]?.index ?? html.length;
    const card = html.slice(cardStart, cardEnd);
    const title = stripHtml(heading[1]);
    const startText = card.match(/<strong>\s*Start date\s*<\/strong>[\s\S]*?<h6[^>]*>([\s\S]*?)<\/h6>/i)?.[1];
    const endText = card.match(/<strong>\s*End date\s*<\/strong>[\s\S]*?<h6[^>]*>([\s\S]*?)<\/h6>/i)?.[1];
    const applicationStartDate = parseDate(stripHtml(startText), false);
    const applicationDeadline = parseDate(stripHtml(endText));
    let applicationStatus = "unknown";
    if (applicationDeadline && applicationDeadline < now) applicationStatus = "closed";
    else if (applicationStartDate && applicationStartDate > now) applicationStatus = "upcoming";
    else if (applicationStartDate && applicationDeadline) applicationStatus = "open";
    if (title) opportunities.push({
      title,
      applicationStartDate,
      applicationDeadline,
      applicationStatus,
      officialGuidelineUrl: card.match(/<a[^>]+href=["']([^"']+)["'][^>]*>\s*Guidelines\s*<\/a>/i)?.[1] ?? "",
    });
  }
  return opportunities;
}

export function parseTribalScholarshipHeadings(html) {
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  const schemes = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const title = stripHtml(heading[1]).replace(/:$/, "").trim();
    if (!/^(?:Pre Matric|Post Matric|National Scholarship|National Fellowship|National Overseas)/i.test(title)) continue;
    const sectionEnd = headings[index + 1]?.index ?? html.length;
    const description = stripHtml(html.slice(heading.index + heading[0].length, sectionEnd)).slice(0, 4000);
    const startText = description.match(/(?:application|apply)\s+(?:open|starts?)\s*(?:from)?\s*:?\s*(\d{2}-\d{2}-\d{4})/i)?.[1];
    const deadlineText = description.match(/(?:application|apply)\s+(?:open till|closed on|last date|deadline)\s*:?\s*(\d{2}-\d{2}-\d{4})/i)?.[1];
    const applicationStartDate = parseDate(startText, false);
    const applicationDeadline = parseDate(deadlineText);
    let applicationStatus = "unknown";
    if (applicationDeadline && applicationDeadline < new Date()) applicationStatus = "closed";
    else if (applicationStartDate && applicationStartDate > new Date()) applicationStatus = "upcoming";
    else if (applicationStartDate && applicationDeadline) applicationStatus = "open";
    schemes.push({ title, description, applicationStartDate, applicationDeadline, applicationStatus });
  }
  return schemes;
}

export function parseUpScholarshipTimetable(html) {
  const schemes = [];
  for (const [, table] of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const tableText = stripHtml(table);
    if (!/Scheme/i.test(tableText) || !/Category/i.test(tableText) || !/Issue Date/i.test(tableText)) continue;
    for (const [, row] of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => stripHtml(match[1]));
      if (cells.length < 4 || !/(?:Pre|Post)matric/i.test(cells[1] ?? "")) continue;
      const title = cells[1].replace(/\s+/g, " ").trim();
      const academicYear = title.match(/20\d{2}-\d{2,4}/)?.[0] ?? "";
      const sourceDocument = row.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1] ?? "";
      schemes.push({
        title,
        academicYear,
        categoryRequirements: cells[2].split(/[,;]\s*/).filter(Boolean),
        issueDate: cells[3],
        sourceDocument,
      });
    }
    if (schemes.length) break;
  }
  return schemes;
}

function canonicalTitle(value = "") {
  return stripHtml(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function ensureSource(sourceDefinition) {
  const update = {
    $set: {
      name: sourceDefinition.name,
      sourceType: sourceDefinition.sourceType,
      authorityType: sourceDefinition.authorityType,
      sourceCategory: sourceDefinition.sourceCategory,
      state: sourceDefinition.state ?? "",
      collectorKey: sourceDefinition.collectorKey,
      enabled: sourceDefinition.enabled,
      limitation: sourceDefinition.limitation ?? "",
      ...(!sourceDefinition.enabled ? { monitoringStatus: "disabled" } : {}),
    },
  };
  if (sourceDefinition.enabled) {
    update.$setOnInsert = { monitoringStatus: sourceDefinition.monitoringStatus };
  }
  return ScholarshipSource.findOneAndUpdate(
    { url: sourceDefinition.url },
    update,
    { upsert: true, new: true },
  );
}

async function initializeScholarshipSources() {
  await Promise.all(sourceDefinitions.map((definition) => ensureSource(definition)));
}

async function recordSourceSync(source, { status, discovered = 0, updated = 0, deduplicated = 0, durationMs = 0, error = "" }) {
  const success = status === "success" || status === "partial";
  await ScholarshipSource.updateOne({ _id: source._id }, {
    $set: {
      monitoringStatus: status === "partial" ? "partial" : success ? "active" : status === "restricted" ? "restricted" : "unavailable",
      lastCheckedAt: new Date(),
      ...(success ? { lastSuccessfulAt: new Date() } : {}),
      lastDiscovered: discovered,
      lastUpdated: updated,
      lastDeduplicated: deduplicated,
      lastSyncDurationMs: durationMs,
      lastError: error,
    },
  });
}

function inferOrganization(title, cardHtml) {
  if (/AICTE|Pragati|Saksham|Swanath|Jammu Kashmir/i.test(title)) return "All India Council for Technical Education";
  if (/UGC|Ishan Uday|Post Graduate Studies/i.test(title)) return "University Grants Commission";
  const imageMatch = cardHtml.match(/MinistryImages\/([^"/]+)\.(?:png|jpg|jpeg)/i);
  if (imageMatch) {
    return decodeURIComponent(imageMatch[1])
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return "National Scholarship Portal";
}

function inferCategories(title, organization) {
  const categories = [];
  if (/^Prime Minister|^National|^AICTE|^UGC|^PM |Ministry|Department/i.test(title) ||
      /Ministry|Department|Commission|Council/i.test(organization)) {
    categories.push("central-government", "Central Government Scholarships");
  }
  if (/merit/i.test(title)) {
    categories.push("merit", "Merit-Based Scholarships");
  }
  if (/girl|women/i.test(title)) {
    categories.push("girls", "Girls Education Scholarships");
  }
  if (/\b(?:OBCs?|SCs?|STs?|DNTs?|EBCs?)\b/i.test(title)) {
    categories.push("sc-st-obc", "SC/ST/OBC Scholarships");
  }
  if (/minority/i.test(title)) {
    categories.push("minority", "Minority Scholarships");
  }
  if (/technical|degree|diploma|engineering/i.test(title)) {
    categories.push("technical", "Technical Education Scholarships");
  }
  if (/college|university|post graduate|under graduate/i.test(title)) {
    categories.push("college-university", "College and University Scholarships");
  }
  if (/research|fellowship|scholarship scheme for post/i.test(title)) {
    categories.push("research", "Research Fellowships");
  }
  return [...new Set(categories)];
}

function extractCards(html) {
  const cards = [];
  const rowRegex = /<div class="row mb-4 border-1 border-bottom">([\s\S]*?)(?=<div class="row mb-4 border-1 border-bottom">|<\/div>\s*<\/div>\s*<\/section>)/gi;
  let match;
  while ((match = rowRegex.exec(html))) cards.push(match[1]);
  return cards;
}

async function fetchNationalPortal() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(NSP_URL, {
        headers: {
          "User-Agent": "TOPPER Scholarship Catalog/1.0",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status < 500 || attempt === 3) return response;
      lastError = new Error(`NSP returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw lastError ?? new Error("NSP fetch failed after retries.");
}

async function fetchUgcPage(url) {
  const parsedUrl = new URL(url);
  if (!["www.ugc.gov.in", "frg.ugc.ac.in"].includes(parsedUrl.hostname)) {
    throw new Error("UGC collector refused a URL outside the official UGC domains.");
  }
  const response = await fetch(url, {
    headers: {
      "User-Agent": "TOPPER Scholarship Catalog/1.0",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`UGC returned HTTP ${response.status} for ${parsedUrl.pathname}.`);
  const finalHost = new URL(response.url).hostname;
  if (!["www.ugc.gov.in", "frg.ugc.ac.in"].includes(finalHost)) {
    throw new Error("UGC redirected the collector outside its official domains.");
  }
  return response.text();
}

function ugcSourceHistory(sourceName, url) {
  return [{ sourceName, sourceUrl: url, checkedAt: new Date(), status: "accessible" }];
}

function makeUgcScholarshipRecord(listing, details, html) {
  const title = details.title || listing.title;
  const isFellowship = listing.kind === "fellowship";
  const guidelineHref = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>\s*Guidelines\s*<\/a>/i)?.[1];
  let officialGuidelineUrl = "";
  if (guidelineHref) {
    try {
      officialGuidelineUrl = new URL(guidelineHref, listing.url).href;
    } catch {
      officialGuidelineUrl = "";
    }
  }
  const categories = isFellowship
    ? ["research", "Research Fellowships"]
    : ["central-government", "Central Government Scholarships", "college-university", "College and University Scholarships"];
  return {
    title,
    slug: `${normalizeSlug(title)}-ugc`,
    organization: "University Grants Commission",
    description: details.description,
    category: categories,
    scholarshipType: isFellowship ? "Government Fellowship" : "Government",
    amount: details.assistance ? { display: details.assistance } : null,
    amountType: "unknown",
    eligibilityRules: extractUgcEligibilityRules(details.eligibility),
    benefits: details.assistance ? [details.assistance] : [],
    educationalRequirements: details.eligibility,
    academicYear: "",
    applicationStatus: "unknown",
    applicationStatusVerified: false,
    applicationStatusVerifiedAt: null,
    applicationStartDate: null,
    applicationDeadline: null,
    officialSourceUrl: listing.url,
    officialGuidelineUrl,
    sourceListingUrl: UGC_STUDENT_URL,
    officialApplicationUrl: "",
    sourceName: UGC_SOURCE_NAME,
    sourceIdentifier: `ugc:${listing.kind}:${normalizeSlug(title)}`,
    verificationStatus: "verified",
    publicationStatus: "published",
    lastVerifiedAt: new Date(),
    lastCheckedAt: new Date(),
    sourceHistory: ugcSourceHistory(UGC_SOURCE_NAME, listing.url),
  };
}

function makeUgcFrgRecord(opportunity) {
  let officialGuidelineUrl = "";
  if (opportunity.officialGuidelineUrl) {
    try {
      officialGuidelineUrl = new URL(opportunity.officialGuidelineUrl, UGC_FRG_URL).href;
    } catch {
      officialGuidelineUrl = "";
    }
  }
  const statusVerified = opportunity.applicationStatus !== "unknown";
  return {
    title: opportunity.title,
    slug: `${normalizeSlug(opportunity.title)}-ugc-frg`,
    organization: "University Grants Commission",
    description: "",
    category: ["research", "Research Fellowships"],
    scholarshipType: "Government Fellowship",
    amount: null,
    amountType: "unknown",
    applicationStatus: opportunity.applicationStatus,
    applicationStatusVerified: statusVerified,
    applicationStatusVerifiedAt: statusVerified ? new Date() : null,
    applicationStartDate: opportunity.applicationStartDate,
    applicationDeadline: opportunity.applicationDeadline,
    officialSourceUrl: UGC_FRG_URL,
    officialGuidelineUrl,
    sourceListingUrl: UGC_FRG_URL,
    officialApplicationUrl: "",
    sourceName: UGC_FRG_SOURCE_NAME,
    sourceIdentifier: `ugc-frg:${normalizeSlug(opportunity.title)}`,
    verificationStatus: "verified",
    publicationStatus: opportunity.applicationStatus === "closed" ? "expired" : "published",
    lastVerifiedAt: new Date(),
    lastCheckedAt: new Date(),
    sourceHistory: ugcSourceHistory(UGC_FRG_SOURCE_NAME, UGC_FRG_URL),
  };
}

async function persistDiscoveredRecord(record, candidates, dryRun = false) {
  const normalizedTitle = canonicalTitle(record.title);
  const exactSourceRecord = candidates.find((candidate) =>
    candidate.sourceName === record.sourceName && candidate.sourceIdentifier === record.sourceIdentifier);
  const duplicate = exactSourceRecord || candidates.find((candidate) =>
    canonicalTitle(candidate.title) === normalizedTitle);
  if (!duplicate) {
    if (!dryRun) {
      const created = await Scholarship.create(record);
      candidates.push({ _id: created._id, title: record.title, sourceName: record.sourceName, sourceIdentifier: record.sourceIdentifier });
    } else {
      candidates.push({ title: record.title, sourceName: record.sourceName, sourceIdentifier: record.sourceIdentifier });
    }
    return { discovered: 1, updated: 0, deduplicated: 0 };
  }
  if (dryRun) return { discovered: 0, updated: 1, deduplicated: Number(duplicate.sourceName !== record.sourceName) };

  const existing = await Scholarship.findById(duplicate._id);
  if (!existing) throw new Error(`Scholarship disappeared during source synchronization: ${record.title}`);
  if (!existing.description && record.description) existing.description = record.description;
  if (!existing.educationalRequirements && record.educationalRequirements) existing.educationalRequirements = record.educationalRequirements;
  if (!existing.eligibilityRules?.length && record.eligibilityRules?.length) {
    existing.eligibilityRules = record.eligibilityRules;
  }
  if (!existing.benefits?.length && record.benefits?.length) existing.benefits = record.benefits;
  if (!existing.amount && record.amount) existing.amount = record.amount;
  if (!existing.officialGuidelineUrl && record.officialGuidelineUrl) existing.officialGuidelineUrl = record.officialGuidelineUrl;
  if (record.applicationStatusVerified) {
    existing.applicationStatus = record.applicationStatus;
    existing.applicationStatusVerified = true;
    existing.applicationStatusVerifiedAt = record.applicationStatusVerifiedAt;
    existing.applicationStartDate = record.applicationStartDate ?? existing.applicationStartDate;
    existing.applicationDeadline = record.applicationDeadline ?? existing.applicationDeadline;
    if (record.publicationStatus === "expired") existing.publicationStatus = "expired";
  }
  existing.category = [...new Set([...(existing.category ?? []), ...(record.category ?? [])])];
  existing.lastCheckedAt = new Date();
  const history = [...(existing.sourceHistory ?? [])];
  const incomingHistory = record.sourceHistory?.[0];
  const priorHistory = history.find((entry) => entry.sourceName === incomingHistory?.sourceName && entry.sourceUrl === incomingHistory?.sourceUrl);
  if (priorHistory) {
    priorHistory.checkedAt = new Date();
    priorHistory.status = "accessible";
  } else if (incomingHistory) {
    history.push(incomingHistory);
  }
  existing.sourceHistory = history.slice(-20);
  await existing.save();
  return {
    discovered: 0,
    updated: 1,
    deduplicated: Number(duplicate.sourceName !== record.sourceName),
  };
}

function sourceDefinitionFor(key) {
  const definition = sourceDefinitions.find((source) => source.collectorKey === key);
  if (!definition) throw new Error(`Unknown scholarship source integration: ${key}`);
  return definition;
}

async function fetchRegisteredSource(source) {
  const url = new URL(source.url);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "TOPPER Scholarship Catalog/1.0",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${source.name} returned HTTP ${response.status}.`);
  if (new URL(response.url).hostname !== url.hostname) {
    throw new Error(`${source.name} redirected the collector to a different host.`);
  }
  return response.text();
}

async function recordSourceFailure(source, error, startedAt) {
  const message = error.cause?.code ? `${error.message} (${error.cause.code})` : error.message;
  const status = /HTTP (?:403|401|429)|certificate|TLS|renegotiation/i.test(message)
    ? "restricted"
    : "unavailable";
  await recordSourceSync(source, { status, durationMs: Date.now() - startedAt, error: message });
  return { status: "failed", source: source.name, message, discovered: 0, updated: 0, seen: 0 };
}

function makePortalScholarshipRecord(source, {
  title,
  description = "",
  academicYear = "",
  categories = [],
  categoryRequirements = [],
  applicationStartDate = null,
  applicationDeadline = null,
  applicationStatus = "unknown",
  officialGuidelineUrl = "",
}) {
  const verifiedStatus = applicationStatus !== "unknown";
  return {
    title,
    slug: `${normalizeSlug(title)}-${source.collectorKey}`,
    organization: source.name,
    description,
    category: categories,
    categoryRequirements,
    scholarshipType: "Government",
    academicYear,
    applicationStartDate,
    applicationDeadline,
    applicationStatus,
    applicationStatusVerified: verifiedStatus,
    applicationStatusVerifiedAt: verifiedStatus ? new Date() : null,
    officialSourceUrl: source.url,
    officialGuidelineUrl,
    sourceListingUrl: source.url,
    officialApplicationUrl: "",
    sourceName: source.name,
    sourceIdentifier: `${source.collectorKey}:${normalizeSlug(title)}:${academicYear || "current"}`,
    verificationStatus: "verified",
    publicationStatus: applicationStatus === "closed" ? "expired" : "published",
    lastVerifiedAt: new Date(),
    lastCheckedAt: new Date(),
    sourceHistory: ugcSourceHistory(source.name, source.url),
  };
}

async function syncParsedSource(sourceKey, parseRecords, { dryRun = false, noListingMessage } = {}) {
  const startedAt = Date.now();
  const source = await ensureSource(sourceDefinitionFor(sourceKey));
  let html;
  try {
    html = await fetchRegisteredSource(source);
  } catch (error) {
    return recordSourceFailure(source, error, startedAt);
  }

  let records;
  try {
    records = parseRecords(html).filter((record) => record.title);
  } catch (error) {
    await recordSourceSync(source, {
      status: "restricted",
      durationMs: Date.now() - startedAt,
      error: `Could not parse the public listing: ${error.message}`,
    });
    return { status: "failed", source: source.name, message: "Official page format was not recognized.", discovered: 0, updated: 0, seen: 0 };
  }
  if (!records.length) {
    const message = noListingMessage || "The public page contained no recognized scholarship listing.";
    await recordSourceSync(source, { status: "restricted", durationMs: Date.now() - startedAt, error: message });
    return { status: "success", source: source.name, discovered: 0, updated: 0, deduplicated: 0, seen: 0, message };
  }

  const candidates = await Scholarship.find({}).select("title sourceName sourceIdentifier").lean();
  let discovered = 0;
  let updated = 0;
  let deduplicated = 0;
  for (const parsedRecord of records) {
    const record = makePortalScholarshipRecord(source, parsedRecord);
    const result = await persistDiscoveredRecord(record, candidates, dryRun);
    discovered += result.discovered;
    updated += result.updated;
    deduplicated += result.deduplicated;
  }
  await recordSourceSync(source, {
    status: "success",
    discovered,
    updated,
    deduplicated,
    durationMs: Date.now() - startedAt,
  });
  return { status: "success", source: source.name, discovered, updated, deduplicated, seen: records.length };
}

export async function discoverAicteScholarships(options = {}) {
  return syncParsedSource("aicte", () => [], {
    ...options,
    noListingMessage: "AICTE's official root page has no publicly parseable scholarship listings; the dedicated site could not be verified.",
  });
}

export async function discoverMinistryOfTribalAffairsScholarships(options = {}) {
  return syncParsedSource("tribal-affairs", (html) =>
    parseTribalScholarshipHeadings(html).map((scheme) => ({
      ...scheme,
      categories: [
        "central-government",
        "Central Government Scholarships",
        "sc-st-obc",
        "SC/ST/OBC Scholarships",
        ...(/Fellowship/i.test(scheme.title) ? ["research", "Research Fellowships"] : []),
      ],
    })), options);
}

export async function discoverUttarPradeshScholarships(options = {}) {
  return syncParsedSource("up-scholarship", (html) =>
    parseUpScholarshipTimetable(html).map((scheme) => ({
      title: scheme.title,
      description: "Listed in the official Uttar Pradesh scholarship timetable; application dates are not stated in this timetable.",
      academicYear: scheme.academicYear,
      categories: ["state-government", "State Government Scholarships"],
      categoryRequirements: scheme.categoryRequirements,
      officialGuidelineUrl: scheme.sourceDocument ? new URL(scheme.sourceDocument, sourceDefinitionFor("up-scholarship").url).href : "",
    })), options);
}

export async function discoverMahaDbtScholarships(options = {}) {
  return syncParsedSource("mahadbt", () => [], {
    ...options,
    noListingMessage: "MahaDBT's public page exposes portal notices but no public scholarship listing feed; no records were inferred from its application services.",
  });
}

export async function discoverOdishaScholarships(options = {}) {
  return syncParsedSource("odisha-scholarship", () => [], {
    ...options,
    noListingMessage: "The Odisha portal returned only its application shell; its application data service is not treated as a public listing feed.",
  });
}

export async function discoverPunjabScholarships(options = {}) {
  return syncParsedSource("punjab-scholarship", () => [], {
    ...options,
    noListingMessage: "The official Punjab root page contains no scholarship listing.",
  });
}

export async function discoverMinistryOfEducationScholarships(options = {}) {
  return syncParsedSource("ministry-of-education", () => [], {
    ...options,
    noListingMessage: "The Ministry of Education page exposed no accessible scholarship listing.",
  });
}

export async function discoverSocialJusticeScholarships(options = {}) {
  return syncParsedSource("social-justice", () => [], {
    ...options,
    noListingMessage: "The Ministry of Social Justice page exposed no accessible scholarship listing.",
  });
}

export async function discoverSbiFoundationScholarships(options = {}) {
  return syncParsedSource("sbi-foundation-asha", () => [], {
    ...options,
    noListingMessage: "The public SBI Foundation page currently exposes no current application listing with a verifiable application window.",
  });
}

export async function discoverUgcScholarships({ dryRun = false } = {}) {
  const startedAt = Date.now();
  const source = await ensureSource(sourceDefinitions[1]);
  let listings;
  try {
    listings = parseUgcStudentListings(await fetchUgcPage(UGC_STUDENT_URL));
    if (!listings.length) throw new Error("UGC student-corner listing contained no recognized scholarship or fellowship entries.");
  } catch (error) {
    const status = error.message.includes("HTTP 403") || error.message.includes("HTTP 429") ? "restricted" : "unavailable";
    await recordSourceSync(source, { status, durationMs: Date.now() - startedAt, error: error.message });
    return { status: "failed", source: UGC_SOURCE_NAME, message: error.message, discovered: 0, updated: 0, seen: 0 };
  }

  const candidates = await Scholarship.find({}).select("title sourceName sourceIdentifier").lean();
  let discovered = 0;
  let updated = 0;
  let deduplicated = 0;
  const errors = [];
  for (const listing of listings) {
    try {
      const html = await fetchUgcPage(listing.url);
      const details = parseUgcScholarshipDetails(html);
      if (!details.title && !listing.title) throw new Error(`UGC detail page contained no scheme title: ${listing.url}`);
      const record = makeUgcScholarshipRecord(listing, details, html);
      const result = await persistDiscoveredRecord(record, candidates, dryRun);
      discovered += result.discovered;
      updated += result.updated;
      deduplicated += result.deduplicated;
    } catch (error) {
      errors.push(`${listing.title}: ${error.message}`);
    }
  }
  const status = errors.length === 0 ? "success" : discovered + updated > 0 ? "partial" : "unavailable";
  await recordSourceSync(source, {
    status,
    discovered,
    updated,
    deduplicated,
    durationMs: Date.now() - startedAt,
    error: errors.join("; ").slice(0, 1000),
  });
  return { status, source: UGC_SOURCE_NAME, discovered, updated, deduplicated, seen: listings.length, errors };
}

export async function discoverUgcFellowshipGrants({ dryRun = false } = {}) {
  const startedAt = Date.now();
  const source = await ensureSource(sourceDefinitions[2]);
  let opportunities;
  try {
    opportunities = parseUgcFrgOpportunities(await fetchUgcPage(UGC_FRG_URL));
  } catch (error) {
    const status = error.message.includes("HTTP 403") || error.message.includes("HTTP 429") ? "restricted" : "unavailable";
    await recordSourceSync(source, { status, durationMs: Date.now() - startedAt, error: error.message });
    return { status: "failed", source: UGC_FRG_SOURCE_NAME, message: error.message, discovered: 0, updated: 0, seen: 0 };
  }
  if (!opportunities.length) {
    const message = "UGC Fellowship and Research Grants page contained no publicly listed opportunities.";
    await recordSourceSync(source, { status: "success", durationMs: Date.now() - startedAt });
    return { status: "success", source: UGC_FRG_SOURCE_NAME, discovered: 0, updated: 0, seen: 0, message };
  }

  const candidates = await Scholarship.find({}).select("title sourceName sourceIdentifier").lean();
  let discovered = 0;
  let updated = 0;
  let deduplicated = 0;
  for (const opportunity of opportunities) {
    const result = await persistDiscoveredRecord(makeUgcFrgRecord(opportunity), candidates, dryRun);
    discovered += result.discovered;
    updated += result.updated;
    deduplicated += result.deduplicated;
  }
  await recordSourceSync(source, {
    status: "success",
    discovered,
    updated,
    deduplicated,
    durationMs: Date.now() - startedAt,
  });
  return { status: "success", source: UGC_FRG_SOURCE_NAME, discovered, updated, deduplicated, seen: opportunities.length };
}

export async function discoverNationalScholarships({ dryRun = false } = {}) {
  const startedAt = Date.now();
  const sourceUrl = NSP_URL;
  const source = await ensureSource(sourceDefinitions[0]);

  let response;
  try {
    response = await fetchNationalPortal();
  } catch (error) {
    const message = error.cause?.code ? `${error.message} (${error.cause.code})` : error.message;
    await recordSourceSync(source, { status: "unavailable", durationMs: Date.now() - startedAt, error: message });
    return { status: "failed", source: "National Scholarship Portal", message, discovered: 0, updated: 0 };
  }

  if (!response.ok) {
    const message = `NSP returned HTTP ${response.status}`;
    await recordSourceSync(source, { status: "unavailable", durationMs: Date.now() - startedAt, error: message });
    return { status: "failed", source: "National Scholarship Portal", message, discovered: 0, updated: 0 };
  }

  const html = await response.text();
  const cards = extractCards(html);
  let discovered = 0;
  let updated = 0;

  for (const card of cards) {
    const titleMatch = card.match(/<h6[^>]*>\s*([^<]+)<\/h6>/i);
    if (!titleMatch) continue;
    const title = decodeHtml(titleMatch[1]);
    if (!title) continue;

    const startMatch = card.match(/Scheme\s+Open\s+from\s*:\s*(\d{2}-\d{2}-\d{4})/i);
    const deadlineMatch = card.match(/Student Application\s+(Open till|Closed on)\s*:?\s*(\d{2}-\d{2}-\d{4})/i);
    const applicationStartDate = parseDate(startMatch?.[1], false);
    const applicationDeadline = parseDate(deadlineMatch?.[2]);
    const officialLinks = [...card.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi)];
    const specificationLink = officialLinks.find((match) => /Specifications/i.test(match[2]))?.[1];
    const faqLink = officialLinks.find((match) => /FAQ/i.test(match[2]))?.[1];
    let officialSourceUrl = specificationLink?.replace(/&amp;/gi, "&") || NSP_LOGIN_URL;
    try {
      officialSourceUrl = new URL(officialSourceUrl, NSP_URL).href;
    } catch {
      officialSourceUrl = NSP_URL;
    }
    let officialFaqUrl = "";
    if (faqLink) {
      try {
        officialFaqUrl = new URL(faqLink.replace(/&amp;/gi, "&"), NSP_URL).href;
      } catch {
        officialFaqUrl = "";
      }
    }

    const organization = inferOrganization(title, card);
    const categories = inferCategories(title, organization);
    const academicYearMatch = card.match(/20\d{2}-20\d{2}|20\d{2}-\d{2}/);
    const academicYear = academicYearMatch?.[0] || "";
    const slug = `${normalizeSlug(title)}-${academicYear || "nsp"}`;
    const closedText = deadlineMatch?.[1]?.toLowerCase() === "closed on";
    const deadlinePassed = Boolean(applicationDeadline && applicationDeadline <= new Date());
    const publicationStatus = closedText || deadlinePassed ? "expired" : "published";
    const applicationStatus = closedText || deadlinePassed
      ? "closed"
      : deadlineMatch?.[1]?.toLowerCase() === "open till"
        ? "open"
        : "unknown";
    const sourceIdentifier = `nsp:${normalizeSlug(title)}:${academicYear || "open"}`;
    const record = {
      title,
      slug,
      organization,
      description: "Official scholarship scheme listed on the National Scholarship Portal.",
      category: categories,
      scholarshipType: /merit based/i.test(title)
        ? "Merit-based"
        : /welfare based|need based/i.test(title)
          ? "Need-based"
          : "Government",
      amount: null,
      amountType: "unknown",
      academicYear,
      applicationStatus,
      applicationStatusVerified: Boolean(deadlineMatch && applicationDeadline),
      applicationStatusVerifiedAt: deadlineMatch && applicationDeadline ? new Date() : null,
      applicationStartDate,
      applicationDeadline,
      officialSourceUrl,
      officialGuidelineUrl: specificationLink ? officialSourceUrl : "",
      officialFaqUrl,
      sourceListingUrl: NSP_URL,
      officialApplicationUrl: NSP_LOGIN_URL,
      sourceName: "National Scholarship Portal",
      sourceIdentifier,
      verificationStatus: "verified",
      publicationStatus,
      confidenceScore: 95,
      isFeatured: /PM |Pragati|Ishan Uday|YASASVI/i.test(title),
      lastVerifiedAt: new Date(),
      lastCheckedAt: new Date(),
      sourceHistory: [{ sourceUrl: officialSourceUrl, sourceName: "National Scholarship Portal", checkedAt: new Date(), status: "accessible" }],
    };

    if (!dryRun) {
      const existing = await Scholarship.findOne({
        $or: [
          { sourceName: "National Scholarship Portal", sourceIdentifier },
          { title: { $regex: `^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }, organization },
        ],
      });
      if (existing) {
        const recordFields = { ...record };
        delete recordFields.sourceHistory;
        for (const field of [
          "description", "amount", "amountType", "eligibilityRules",
          "eligibilityGroups", "requiredDocuments", "educationalRequirements",
          "benefits", "stateRequirements", "categoryRequirements", "incomeLimit",
          "selectionProcess", "applicationInstructions", "eligibleCourses",
          "educationLevels", "criteriaCategory", "category",
        ]) {
          delete recordFields[field];
        }
        const categoriesToRemove = new Set(["sc-st-obc", "SC/ST/OBC Scholarships"]);
        recordFields.category = [
          ...new Set([
            ...(existing.category ?? []).filter((category) => !categoriesToRemove.has(category)),
            ...categories,
          ]),
        ];
        await Scholarship.updateOne({ _id: existing._id }, {
          $set: recordFields,
          $push: { sourceHistory: { $each: [{ sourceUrl: officialSourceUrl, sourceName: "National Scholarship Portal", checkedAt: new Date(), status: "accessible" }], $slice: -20 } },
        });
        updated += 1;
      } else {
        await Scholarship.create(record);
        discovered += 1;
      }
    } else {
      discovered += 1;
    }
  }

  await ScholarshipSource.updateOne({ _id: source._id }, {
    $set: {
      lastCheckedAt: new Date(),
    },
  });
  await Scholarship.updateMany(
    {
      sourceName: "National Scholarship Portal",
      applicationDeadline: { $lte: new Date() },
      publicationStatus: "published",
    },
    { $set: { publicationStatus: "expired", applicationStatus: "closed", applicationStatusVerified: true } },
  );

  await recordSourceSync(source, { status: "success", discovered, updated, durationMs: Date.now() - startedAt });
  return { status: "success", source: "National Scholarship Portal", discovered, updated, seen: cards.length };
}

export async function discoverAllConfiguredScholarships({ dryRun = false } = {}) {
  await initializeScholarshipSources();
  const results = [];
  for (const collector of [
    discoverNationalScholarships,
    discoverUgcScholarships,
    discoverUgcFellowshipGrants,
    discoverMinistryOfTribalAffairsScholarships,
    discoverUttarPradeshScholarships,
  ]) {
    results.push(await collector({ dryRun }));
  }
  const statusCollectors = await Promise.all([
    discoverAicteScholarships({ dryRun }),
    discoverMinistryOfEducationScholarships({ dryRun }),
    discoverSocialJusticeScholarships({ dryRun }),
    discoverMahaDbtScholarships({ dryRun }),
    discoverOdishaScholarships({ dryRun }),
    discoverPunjabScholarships({ dryRun }),
  ]);
  results.push(...statusCollectors);
  return {
    status: results.every((result) => result.status === "success") ? "success" : "partial",
    results,
  };
}

export async function getScholarshipSourceStats() {
  await initializeScholarshipSources();
  const [sources, records] = await Promise.all([
    ScholarshipSource.find({}).sort({ sourceCategory: 1, state: 1, name: 1 }).lean(),
    Scholarship.find({
      verificationStatus: "verified",
      publicationStatus: { $ne: "draft" },
    }).select("sourceName sourceHistory applicationStatus applicationStatusVerified applicationDeadline").lean(),
  ]);
  const counts = new Map();
  for (const record of records) {
    const names = new Set([
      record.sourceName,
      ...(record.sourceHistory ?? []).map((entry) => entry?.sourceName),
    ].filter(Boolean));
    for (const name of names) {
      const current = counts.get(name) ?? { recordCount: 0, openCount: 0, closedCount: 0, unconfirmedCount: 0 };
      current.recordCount += 1;
      if (record.applicationStatusVerified && record.applicationStatus === "open" &&
          (!record.applicationDeadline || record.applicationDeadline > new Date())) {
        current.openCount += 1;
      } else if (record.applicationStatusVerified && record.applicationStatus === "closed") {
        current.closedCount += 1;
      } else {
        current.unconfirmedCount += 1;
      }
      counts.set(name, current);
    }
  }
  return sources.map((source) => ({
    id: source._id.toString(),
    name: source.name,
    url: source.url,
    sourceType: source.sourceType,
    authorityType: source.authorityType,
    sourceCategory: source.sourceCategory,
    state: source.state,
    collectorKey: source.collectorKey,
    enabled: source.enabled,
    monitoringStatus: source.monitoringStatus,
    limitation: source.limitation,
    lastCheckedAt: source.lastCheckedAt,
    lastSuccessfulAt: source.lastSuccessfulAt,
    lastDiscovered: source.lastDiscovered ?? 0,
    lastUpdated: source.lastUpdated ?? 0,
    lastDeduplicated: source.lastDeduplicated ?? 0,
    lastSyncDurationMs: source.lastSyncDurationMs,
    lastError: source.lastError,
    ...(counts.get(source.name) ?? { recordCount: 0, openCount: 0, closedCount: 0, unconfirmedCount: 0 }),
  }));
}

export function startScholarshipDiscoveryJobs() {
  const key = Symbol.for("topper.scholarship-discovery");
  globalThis[key] ??= { started: false, timer: null, retryTimer: null, failures: 0, running: false };
  const state = globalThis[key];
  if (state.started) return;
  state.started = true;

  const run = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const result = await discoverAllConfiguredScholarships();
      const failures = result.results.filter((item) => item.status !== "success");
      const nationalPortalFailure = failures.find((item) => item.source === "National Scholarship Portal");
      if (nationalPortalFailure) {
        throw new Error(nationalPortalFailure.message || "National Scholarship Portal synchronization failed.");
      }
      if (failures.length) {
        console.error("[scholarships] Some additional source integrations failed.", { results: failures });
      }
      state.failures = 0;
      if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
      }
    } catch (error) {
      state.failures += 1;
      console.error("[scholarships] Discovery failed.", {
        message: error.message,
        retryAttempt: state.failures,
      });
      if (!state.retryTimer) {
        const delay = Math.min(5 * 60_000 * 2 ** Math.min(state.failures - 1, 4), 60 * 60_000);
        state.retryTimer = setTimeout(() => {
          state.retryTimer = null;
          void run();
        }, delay);
        if (state.retryTimer.unref) state.retryTimer.unref();
      }
    } finally {
      state.running = false;
    }
  };
  void run();
  state.timer = setInterval(() => { void run(); }, 6 * 60 * 60 * 1000);
  if (state.timer.unref) state.timer.unref();
}
