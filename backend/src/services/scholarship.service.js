import mongoose from "mongoose";
import Scholarship from "../models/Scholarship.js";
import ScholarshipProfile from "../models/ScholarshipProfile.js";
import ScholarshipApplication from "../models/ScholarshipApplication.js";
import SavedScholarship from "../models/SavedScholarship.js";

export function normalizeSlug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function extractUgcEligibilityRules(eligibilityText = "") {
  const text = String(eligibilityText).replace(/\s+/g, " ").trim();
  const rules = [];
  const qualifiedAt = text.search(/qualified/i);
  const netJrfAt = text.search(/NET[-\s]?JRF/i);
  const ugcCsirAt = text.search(/UGC[-\s]?CSIR/i);
  const jointTestMatch = text.match(/joint test/i);
  if (qualifiedAt >= 0 && netJrfAt > qualifiedAt && ugcCsirAt > netJrfAt && jointTestMatch) {
    rules.push({
      field: "netJrfQualified",
      operator: "eq",
      value: true,
      reason: text.slice(qualifiedAt, jointTestMatch.index + jointTestMatch[0].length).trim(),
    });
  }
  const registrationAt = text.search(/registration/i);
  const withinMatch = text.match(/within/i);
  const twoYearsMatch = text.match(/two years/i);
  if (registrationAt >= 0 && withinMatch?.index > registrationAt &&
      twoYearsMatch?.index > withinMatch.index) {
    rules.push({
      field: "researchRegistrationWithinStipulatedPeriod",
      operator: "eq",
      value: true,
      reason: text.slice(registrationAt, twoYearsMatch.index + twoYearsMatch[0].length).trim(),
    });
  }
  return rules;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export async function listPublishedScholarships(query = {}) {
  const page = Math.min(Math.max(Number(query.page ?? 1), 1), 10000);
  const limit = Math.min(Math.max(Number(query.limit ?? 12), 1), 50);
  const filter = {
    publicationStatus: query.status === "closed"
      ? { $in: ["published", "expired", "closed"] }
      : "published",
    verificationStatus: "verified",
  };
  if (query.search) {
    const search = String(query.search).trim();
    if (search) filter.$text = { $search: search };
  }
  if (query.category) {
    const categoryAliases = {
      "central-government": ["central-government", "Central Government Scholarships"],
      "state-government": ["state-government", "State Government Scholarships"],
      "private": ["private", "Private Scholarships"],
      "merit": ["merit", "Merit-Based Scholarships"],
      "need-based": ["need-based", "Need-Based Scholarships"],
      "minority": ["minority", "Minority Scholarships"],
      "sc-st-obc": ["sc-st-obc", "SC/ST/OBC Scholarships"],
      "girls": ["girls", "Girls Education Scholarships"],
      "college-university": ["college-university", "College and University Scholarships"],
      "international": ["international", "International Scholarships"],
      "research": ["research", "Research Fellowships"],
      "technical": ["technical", "Technical Education Scholarships"],
    };
    const aliases = categoryAliases[String(query.category).toLowerCase()] ?? [String(query.category)];
    filter.category = { $in: aliases };
  }
  if (query.state) {
    filter.$and = [
      ...(filter.$and ?? []),
      { $or: [
        { stateRequirements: String(query.state) },
        { stateRequirements: { $exists: false } },
        { stateRequirements: { $size: 0 } },
      ] },
    ];
  }
  if (query.course) {
    const course = String(query.course).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$and = [
      ...(filter.$and ?? []),
      { $or: [
        { eligibleCourses: { $regex: course, $options: "i" } },
        { eligibleCourses: { $exists: false } },
        { eligibleCourses: { $size: 0 } },
      ] },
    ];
  }
  if (query.scholarshipType) filter.scholarshipType = String(query.scholarshipType);
  if (query.educationLevel) {
    filter.$and = [
      ...(filter.$and ?? []),
      { $or: [
        { educationLevels: String(query.educationLevel) },
        { educationLevels: { $exists: false } },
        { educationLevels: { $size: 0 } },
      ] },
    ];
  }
  if (query.eligibilityCategory) {
    filter.$and = [
      ...(filter.$and ?? []),
      { $or: [
        { criteriaCategory: String(query.eligibilityCategory) },
        { criteriaCategory: { $exists: false } },
        { criteriaCategory: { $size: 0 } },
      ] },
    ];
  }
  if (query.maxIncome !== undefined && query.maxIncome !== "") {
    const maxIncome = Number(query.maxIncome);
    if (Number.isFinite(maxIncome) && maxIncome >= 0) {
      filter.$and = [
        ...(filter.$and ?? []),
        { $or: [{ incomeLimit: null }, { incomeLimit: { $gte: maxIncome } }] },
      ];
    }
  }
  if (query.deadlineWithin) {
    const days = Number(query.deadlineWithin);
    if (Number.isInteger(days) && days > 0 && days <= 365) {
      filter.applicationDeadline = { $gte: new Date(), $lte: new Date(Date.now() + days * 86400000) };
    }
  }
  if (query.featured === "true") filter.isFeatured = true;
  if (query.status === "open") {
    filter.applicationStatus = "open";
    filter.applicationStatusVerified = true;
  } else if (query.status === "closed") {
    filter.applicationStatus = "closed";
    filter.applicationStatusVerified = true;
  } else if (query.status === "upcoming") {
    filter.applicationStatus = "upcoming";
    filter.applicationStatusVerified = true;
  }
  let sort = { isFeatured: -1, applicationDeadline: 1, createdAt: -1 };
  if (query.sort === "newest") sort = { createdAt: -1, applicationDeadline: 1 };
  if (query.sort === "deadline") sort = { applicationDeadline: 1, createdAt: -1 };
  if (query.sort === "amount") sort = { amountValue: -1, createdAt: -1 };
  if (query.sort === "alphabetical") sort = { title: 1 };
  const [items, total] = await Promise.all([
    Scholarship.find(filter).sort(sort)
      .skip((page - 1) * limit).limit(limit).lean(),
    Scholarship.countDocuments(filter),
  ]);
  return { scholarships: items.map(serializeScholarship), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export function isApplicationOpen(scholarship, now = new Date()) {
  const deadline = scholarship.applicationDeadline ? new Date(scholarship.applicationDeadline) : null;
  return scholarship.publicationStatus === "published" &&
    scholarship.applicationStatus === "open" &&
    scholarship.applicationStatusVerified === true &&
    (!deadline || deadline > now);
}

export function serializeScholarship(s) {
  const deadline = s.applicationDeadline ? new Date(s.applicationDeadline) : null;
  const applicationStatus = s.applicationStatus ??
    (deadline && deadline > new Date() ? "open" : deadline ? "closed" : "unknown");
  const open = isApplicationOpen({ ...s, applicationStatus });
  return {
    id: s._id?.toString(),
    title: s.title,
    slug: s.slug,
    description: s.description,
    organization: s.organization,
    category: s.category,
    scholarshipType: s.scholarshipType,
    criteriaCategory: s.criteriaCategory ?? [],
    eligibleCourses: s.eligibleCourses ?? [],
    educationLevels: s.educationLevels ?? [],
    amount: s.amount,
    amountValue: s.amountValue,
    amountType: s.amountType,
    requiredDocuments: s.requiredDocuments,
    educationalRequirements: s.educationalRequirements,
    benefits: s.benefits,
    stateRequirements: s.stateRequirements,
    categoryRequirements: s.categoryRequirements,
    incomeLimit: s.incomeLimit,
    applicationStartDate: s.applicationStartDate,
    applicationDeadline: s.applicationDeadline,
    selectionProcess: s.selectionProcess,
    applicationInstructions: s.applicationInstructions,
    academicYear: s.academicYear,
    applicationStatus,
    applicationStatusVerified: s.applicationStatusVerified === true,
    applicationStatusVerifiedAt: s.applicationStatusVerifiedAt ?? null,
    officialSourceUrl: s.officialSourceUrl,
    officialGuidelineUrl: s.officialGuidelineUrl || "",
    officialFaqUrl: s.officialFaqUrl || "",
    sourceListingUrl: s.sourceListingUrl || "",
    officialApplicationUrl: s.officialApplicationUrl,
    sourceName: s.sourceName,
    verificationStatus: s.verificationStatus,
    publicationStatus: s.publicationStatus,
    lastVerifiedAt: s.lastVerifiedAt,
    lastCheckedAt: s.lastCheckedAt,
    isFeatured: s.isFeatured,
    eligibilityRules: s.eligibilityRules,
    eligibilityGroups: s.eligibilityGroups,
    open,
  };
}

export async function getScholarshipBySlug(slug) {
  const scholarship = await Scholarship.findOne({
    slug: String(slug),
    publicationStatus: { $in: ["published", "closed", "expired"] },
  }).lean();
  if (!scholarship) {
    const error = new Error("Scholarship not found.");
    error.statusCode = 404;
    throw error;
  }
  return serializeScholarship(scholarship);
}

export async function getProfile(userId) {
  return ScholarshipProfile.findOne({ user: userId }).lean();
}

const profileFields = [
  "fullName", "dateOfBirth", "gender", "state", "district", "domicileState",
  "category", "minorityStatus", "disabilityStatus", "educationLevel", "courseName",
  "currentAcademicYear", "collegeName", "universityRegistrationNumber",
  "tenthPercentage", "twelfthPercentage", "currentSemesterPercentage",
  "previousExamPercentage", "annualFamilyIncome", "incomeCertificateAvailable",
  "bplStatus", "residenceType", "domicileCertificateAvailable",
  "aadhaarAvailable", "bankAccountAvailable", "netJrfQualified",
  "researchRegistrationWithinStipulatedPeriod",
];

export async function saveProfile(userId, body, replace = false) {
  const existing = await ScholarshipProfile.findOne({ user: userId });
  const values = replace ? body : { ...(existing?.toObject?.() ?? {}), ...body };
  const input = {};
  for (const field of profileFields) {
    if (Object.prototype.hasOwnProperty.call(values, field)) input[field] = values[field];
  }
  input.fullName = String(input.fullName ?? "").trim();
  input.state = String(input.state ?? "").trim();
  input.district = String(input.district ?? "").trim();
  input.domicileState = String(input.domicileState ?? "").trim();
  input.educationLevel = String(input.educationLevel ?? "").trim();
  input.courseName = String(input.courseName ?? "").trim();
  input.currentAcademicYear = String(input.currentAcademicYear ?? "").trim();
  input.collegeName = String(input.collegeName ?? "").trim();
  input.annualFamilyIncome = Number(input.annualFamilyIncome);
  input.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;

  const required = ["fullName", "dateOfBirth", "gender", "state", "district", "domicileState",
    "educationLevel", "courseName", "currentAcademicYear", "collegeName", "annualFamilyIncome"];
  for (const field of required) {
    if (input[field] === null || input[field] === "" || input[field] === undefined ||
        (typeof input[field] === "number" && !Number.isFinite(input[field]))) {
      throw badRequest(`Complete the required profile field: ${field}.`);
    }
  }
  if (input.dateOfBirth && Number.isNaN(input.dateOfBirth.getTime())) throw badRequest("Enter a valid date of birth.");
  if (input.annualFamilyIncome < 0) throw badRequest("Annual family income cannot be negative.");
  input.profileCompletedAt = new Date();
  const profile = await ScholarshipProfile.findOneAndUpdate(
    { user: userId },
    { $set: { ...input, user: userId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return profile.toObject();
}

function valueForField(profile, field) {
  if (field === "age") {
    if (profile?.age != null) return Number(profile.age);
    if (profile?.dateOfBirth) {
      const birthDate = new Date(profile.dateOfBirth);
      if (!Number.isNaN(birthDate.getTime())) {
        const now = new Date();
        return now.getFullYear() - birthDate.getFullYear() -
          (now < new Date(now.getFullYear(), birthDate.getMonth(), birthDate.getDate()) ? 1 : 0);
      }
    }
  }
  const aliases = {
    state: "state",
    domicile: "domicileState",
    domicileState: "domicileState",
    course: "courseName",
    courseName: "courseName",
    educationLevel: "educationLevel",
    academicYear: "currentAcademicYear",
    currentAcademicYear: "currentAcademicYear",
    category: "category",
    income: "annualFamilyIncome",
    annualFamilyIncome: "annualFamilyIncome",
    gender: "gender",
    minority: "minorityStatus",
    disability: "disabilityStatus",
    marks: "previousExamPercentage",
    percentage: "previousExamPercentage",
  };
  return profile?.[aliases[field] ?? field];
}

const eligibilityQuestionFields = {
  state: { label: "Current state", type: "text" },
  domicile: { label: "Domicile state", type: "text" },
  domicileState: { label: "Domicile state", type: "text" },
  course: { label: "Course", type: "text" },
  courseName: { label: "Course", type: "text" },
  educationLevel: { label: "Education level", type: "text" },
  academicYear: { label: "Academic year", type: "text" },
  currentAcademicYear: { label: "Academic year", type: "text" },
  category: { label: "Category", type: "select", options: ["general", "sc", "st", "obc", "ews", "other"] },
  income: { label: "Annual family income (₹)", type: "number" },
  annualFamilyIncome: { label: "Annual family income (₹)", type: "number" },
  age: { label: "Age (years)", type: "number" },
  dateOfBirth: { label: "Date of birth", type: "date" },
  district: { label: "District", type: "text" },
  fullName: { label: "Full name", type: "text" },
  collegeName: { label: "College or university", type: "text" },
  universityRegistrationNumber: { label: "University registration number", type: "text" },
  tenthPercentage: { label: "10th percentage", type: "number" },
  twelfthPercentage: { label: "12th percentage", type: "number" },
  currentSemesterPercentage: { label: "Current semester percentage", type: "number" },
  gender: { label: "Gender", type: "select", options: ["female", "male", "other", "prefer_not_to_say"] },
  minority: { label: "Minority status", type: "select", options: ["yes", "no"] },
  minorityStatus: { label: "Minority status", type: "select", options: ["yes", "no"] },
  disability: { label: "Disability status", type: "select", options: ["none", "yes"] },
  disabilityStatus: { label: "Disability status", type: "select", options: ["none", "yes"] },
  incomeCertificateAvailable: { label: "Do you have an income certificate?", type: "select", options: ["yes", "no"] },
  bplStatus: { label: "Do you have applicable BPL status?", type: "select", options: ["yes", "no"] },
  domicileCertificateAvailable: { label: "Do you have a domicile certificate?", type: "select", options: ["yes", "no"] },
  aadhaarAvailable: { label: "Do you have Aadhaar, if required?", type: "select", options: ["yes", "no"] },
  bankAccountAvailable: { label: "Do you have a bank account, if required?", type: "select", options: ["yes", "no"] },
  residenceType: { label: "Residence type", type: "select", options: ["hostel", "day_scholar"] },
  marks: { label: "Previous examination percentage", type: "number" },
  percentage: { label: "Previous examination percentage", type: "number" },
  previousExamPercentage: { label: "Previous examination percentage", type: "number" },
  netJrfQualified: {
    label: "Have you qualified NET-JRF or the UGC-CSIR joint test?",
    type: "select",
    options: ["yes", "no"],
  },
  researchRegistrationWithinStipulatedPeriod: {
    label: "Can your institution complete your M.Phil./Ph.D. registration within the stated two-year period?",
    type: "select",
    options: ["yes", "no"],
  },
};
const booleanEligibilityFields = new Set([
  "netJrfQualified",
  "researchRegistrationWithinStipulatedPeriod",
  "incomeCertificateAvailable",
  "bplStatus",
  "domicileCertificateAvailable",
  "aadhaarAvailable",
  "bankAccountAvailable",
]);

function scholarshipRules(scholarship) {
  return [
    ...(scholarship.eligibilityRules ?? []),
    ...(Array.isArray(scholarship.eligibilityGroups)
      ? scholarship.eligibilityGroups.flatMap((group) => group.rules ?? [])
      : []),
  ];
}

export function getEligibilityQuestions(scholarship, profile = {}) {
  const fields = new Set(scholarshipRules(scholarship).map((rule) => rule.field));
  if (scholarship.incomeLimit != null) fields.add("annualFamilyIncome");
  return [...fields]
    .filter((field) => {
      const actual = valueForField(profile, field);
      return actual === undefined || actual === null || actual === "";
    })
    .map((field) => ({
      field,
      ...(eligibilityQuestionFields[field] ?? { label: field, type: "text" }),
    }));
}

export function mergeEligibilityAnswers(profile, answers = {}) {
  const merged = { ...(profile ?? {}) };
  for (const [field, answer] of Object.entries(answers)) {
    if (!Object.prototype.hasOwnProperty.call(eligibilityQuestionFields, field)) continue;
    const mapped = {
      domicile: "domicileState",
      course: "courseName",
      academicYear: "currentAcademicYear",
      income: "annualFamilyIncome",
      minority: "minorityStatus",
      disability: "disabilityStatus",
      marks: "previousExamPercentage",
      percentage: "previousExamPercentage",
    }[field] ?? field;
    merged[mapped] = booleanEligibilityFields.has(mapped)
      ? answer === true || answer === "yes"
      : answer;
  }
  return merged;
}

function evaluateRule(profile, rule) {
  const field = rule.field;
  const actual = valueForField(profile, field);
  if (actual === undefined || actual === null || actual === "") {
    return rule.required === false
      ? { status: "optional-missing", field }
      : { status: "missing", reason: rule.reason || `Please provide ${field}.`, field };
  }
  let matched = false;
  const expected = rule.value;
  switch (rule.operator) {
    case "eq": matched = String(actual).toLowerCase() === String(expected).toLowerCase(); break;
    case "ne": matched = String(actual).toLowerCase() !== String(expected).toLowerCase(); break;
    case "gte": matched = Number(actual) >= Number(expected); break;
    case "lte": matched = Number(actual) <= Number(expected); break;
    case "gt": matched = Number(actual) > Number(expected); break;
    case "lt": matched = Number(actual) < Number(expected); break;
    case "in": matched = (Array.isArray(expected) ? expected : [expected]).some((v) => String(v).toLowerCase() === String(actual).toLowerCase()); break;
    case "nin": matched = !(Array.isArray(expected) ? expected : [expected]).some((v) => String(v).toLowerCase() === String(actual).toLowerCase()); break;
    case "exists": matched = expected ? actual !== undefined && actual !== null && actual !== "" : actual === undefined || actual === null || actual === "";
      break;
    case "contains": matched = Array.isArray(actual) ? actual.includes(expected) : String(actual).toLowerCase().includes(String(expected).toLowerCase()); break;
    default: matched = false;
  }
  return matched
    ? { status: "passed", field }
    : { status: "failed", reason: rule.reason || `Does not meet the ${field} requirement.`, field };
}

export function evaluateEligibility(profile, scholarship) {
  if (!scholarshipRules(scholarship).length && scholarship.incomeLimit == null) {
    return {
      result: "MORE_INFORMATION_REQUIRED",
      reasons: [],
      missingFields: [],
      questions: [],
      criteriaAvailable: false,
      criteriaMessage: "Eligibility rules are not available in TOPPER's verified catalog yet. Check the official notification before relying on an eligibility result.",
      estimated: true,
      sourceUrl: scholarship.officialSourceUrl,
    };
  }

  profile ??= {};
  const rules = scholarship.eligibilityRules ?? [];
  const missing = [];
  const reasons = [];
  for (const rule of rules) {
    const evaluated = evaluateRule(profile, rule);
    if (evaluated.status === "missing") missing.push(evaluated.field);
    if (evaluated.status === "failed") reasons.push(evaluated.reason);
  }

  if (scholarship.incomeLimit != null) {
    if (profile.annualFamilyIncome == null) missing.push("annualFamilyIncome");
    else if (Number(profile.annualFamilyIncome) > Number(scholarship.incomeLimit)) {
      reasons.push(`Your annual family income exceeds the maximum income limit of ₹${Number(scholarship.incomeLimit).toLocaleString("en-IN")}.`);
    }
  }

  const groups = Array.isArray(scholarship.eligibilityGroups) ? scholarship.eligibilityGroups : [];
  for (const group of groups) {
    if (!Array.isArray(group.rules) || group.rules.length === 0) continue;
    const evaluated = group.rules.map((rule) => evaluateRule(profile, rule));
    const missingGroup = evaluated.filter((item) => item.status === "missing");
    const failedGroup = evaluated.filter((item) => item.status === "failed");
    if (group.operator === "OR") {
      if (!evaluated.some((item) => item.status === "passed")) {
        if (missingGroup.length) {
          missing.push(...missingGroup.map((item) => item.field));
        } else {
          reasons.push(group.reason || failedGroup.map((item) => item.reason).join(" or "));
        }
      }
    } else if (group.operator === "AND") {
      if (missingGroup.length) missing.push(...missingGroup.map((item) => item.field));
      if (failedGroup.length) reasons.push(...failedGroup.map((item) => item.reason));
    }
  }

  const uniqueMissing = [...new Set(missing)];
  const uniqueReasons = [...new Set(reasons)];
  let result = "ELIGIBLE";
  if (uniqueReasons.length) result = "NOT_ELIGIBLE";
  else if (uniqueMissing.length) result = "MORE_INFORMATION_REQUIRED";
  return {
    result,
    reasons: uniqueReasons,
    missingFields: uniqueMissing,
    questions: result === "MORE_INFORMATION_REQUIRED"
      ? getEligibilityQuestions(scholarship, profile)
      : [],
    criteriaAvailable: true,
    estimated: true,
    sourceUrl: scholarship.officialSourceUrl,
  };
}

export async function checkEligibility(userId, scholarshipId, answers = {}) {
  const scholarship = await Scholarship.findById(scholarshipId);
  if (!scholarship) {
    const error = new Error("Scholarship not found.");
    error.statusCode = 404;
    throw error;
  }
  const hasUgcSource = scholarship.sourceName === "University Grants Commission" ||
    scholarship.sourceHistory?.some((entry) => entry?.sourceName === "University Grants Commission");
  if (!scholarship.eligibilityRules?.length && hasUgcSource) {
    const extractedRules = extractUgcEligibilityRules(scholarship.educationalRequirements);
    if (extractedRules.length) {
      scholarship.eligibilityRules = extractedRules;
      await scholarship.save();
    }
  }
  const profile = await ScholarshipProfile.findOne({ user: userId }).lean();
  return evaluateEligibility(mergeEligibilityAnswers(profile, answers), scholarship.toObject());
}

export async function toggleSaved(userId, scholarshipId) {
  if (!mongoose.isValidObjectId(scholarshipId)) throw badRequest("Scholarship ID is invalid.");
  const scholarship = await Scholarship.findById(scholarshipId);
  if (!scholarship) {
    const error = new Error("Scholarship not found.");
    error.statusCode = 404;
    throw error;
  }
  const existing = await SavedScholarship.findOne({ user: userId, scholarship: scholarshipId });
  if (existing) {
    await existing.deleteOne();
    return { saved: false };
  }
  await SavedScholarship.create({ user: userId, scholarship: scholarshipId });
  return { saved: true };
}

export async function listSaved(userId) {
  const saved = await SavedScholarship.find({ user: userId }).populate("scholarship").sort({ createdAt: -1 }).lean();
  return saved.filter((item) => item.scholarship).map((item) => ({
    ...serializeScholarship(item.scholarship),
    savedAt: item.createdAt,
  }));
}

export async function recordApplication(userId, scholarshipId, answers = {}) {
  const scholarship = await Scholarship.findById(scholarshipId);
  if (!scholarship || !["published", "closed"].includes(scholarship.publicationStatus)) {
    const error = new Error("Scholarship is not available.");
    error.statusCode = 404;
    throw error;
  }
  if (scholarship.applicationDeadline && new Date(scholarship.applicationDeadline) <= new Date()) {
    throw badRequest("The application deadline for this scholarship has passed.");
  }
  if (!isApplicationOpen(scholarship)) {
    throw badRequest("Applications are not verified open for this scholarship.");
  }
  if (!scholarship.officialApplicationUrl) throw badRequest("The official application URL is not available.");
  const profile = await ScholarshipProfile.findOne({ user: userId }).lean();
  const eligibility = evaluateEligibility(mergeEligibilityAnswers(profile, answers), scholarship.toObject());
  if (eligibility.result === "NOT_ELIGIBLE") throw badRequest("This scholarship result is not eligible.");
  if (eligibility.result === "MORE_INFORMATION_REQUIRED") throw badRequest("Complete the missing scholarship profile information first.");
  const application = await ScholarshipApplication.findOneAndUpdate(
    { user: userId, scholarship: scholarshipId },
    { $set: { eligibilityResult: eligibility, redirectedAt: new Date(), status: "intended" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return { applicationId: application._id, officialApplicationUrl: scholarship.officialApplicationUrl, eligibility };
}
