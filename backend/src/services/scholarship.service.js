import mongoose from "mongoose";
import Scholarship from "../models/Scholarship.js";
import ScholarshipProfile from "../models/ScholarshipProfile.js";
import ScholarshipApplication from "../models/ScholarshipApplication.js";
import ScholarshipEligibilityResult from "../models/ScholarshipEligibilityResult.js";
import SavedScholarship from "../models/SavedScholarship.js";
import User from "../models/User.js";

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

export function getOfficialUgcPgEligibilityRules(scholarship) {
  const isNationalPgScholarship = /national scholarship for post graduate studies/i.test(
    scholarship?.title ?? "",
  );
  const isUgcSource = scholarship?.sourceName === "University Grants Commission" ||
    scholarship?.sourceHistory?.some((entry) => entry?.sourceName === "University Grants Commission") ||
    scholarship?.officialSourceUrl?.includes("/Scholarships/stu_Scholarship6");
  if (!isNationalPgScholarship || !isUgcSource) return [];

  return [
    { field: "nationality", operator: "eq", value: "Indian", reason: "This scholarship is for Indian students." },
    { field: "age", operator: "lte", value: 30, reason: "Applicants must be 30 years old or younger." },
    { field: "firstYearPostgraduate", operator: "eq", value: "yes", reason: "Applicants must be admitted to the first year of a postgraduate degree programme." },
    { field: "regularFullTime", operator: "eq", value: "yes", reason: "The postgraduate programme must be regular and full-time." },
    { field: "recognizedPgDegree", operator: "eq", value: "yes", verificationRequired: true, reason: "The programme must be a recognized postgraduate degree at an eligible institution; recognition requires official verification." },
    { field: "postgraduateComponent", operator: "in", value: ["yes", "not_applicable"], reason: "For an integrated programme, the student must be in its postgraduate component." },
  ];
}

const northEasternStates = [
  "Arunachal Pradesh",
  "Assam",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Sikkim",
  "Tripura",
];

export function getOfficialIshanUdayEligibilityRules(scholarship) {
  const isIshanUday = /ishan\s+uday/i.test(scholarship?.title ?? "");
  const isUgcSource = scholarship?.sourceName === "University Grants Commission" ||
    scholarship?.sourceHistory?.some((entry) => entry?.sourceName === "University Grants Commission") ||
    scholarship?.officialSourceUrl?.includes("ugc.gov.in");
  if (!isIshanUday || !isUgcSource) return [];

  return [
    { field: "class12Passed", operator: "eq", value: true, reason: "You must have passed Class XII or an equivalent examination." },
    { field: "twelfthSchoolState", operator: "in", value: northEasternStates, reason: "Your Class XII school must be located in the North Eastern Region." },
    { field: "undergraduateFirstYear", operator: "eq", value: "yes", reason: "You must be admitted to the first year of an undergraduate degree programme." },
    { field: "admissionType", operator: "eq", value: "regular", reason: "Admission must be regular/full-time, not distance mode." },
    { field: "recognizedInstitution", operator: "eq", value: "yes", verificationRequired: true, reason: "The undergraduate degree programme must be recognized by UGC; this recognition requires official verification." },
    { field: "annualFamilyIncome", operator: "lt", value: 450000, reason: "Annual parental income must be below ₹4.50 lakh." },
  ];
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
  "tenthPassingYear", "tenthSchoolState", "tenthPercentage",
  "twelfthPassingYear", "twelfthSchoolState", "class12Passed", "twelfthPercentage",
  "undergraduateFirstYear", "admissionType", "recognizedInstitution",
  "currentSemesterPercentage",
  "previousExamPercentage", "annualFamilyIncome", "incomeCertificateAvailable",
  "bplStatus", "residenceType", "domicileCertificateAvailable",
  "aadhaarAvailable", "bankAccountAvailable", "netJrfQualified",
  "researchRegistrationWithinStipulatedPeriod",
  "nationality", "firstYearPostgraduate", "regularFullTime",
  "recognizedPgDegree", "postgraduateComponent",
];

const numericProfileFields = new Set([
  "tenthPassingYear", "tenthPercentage", "twelfthPassingYear", "twelfthPercentage",
  "currentSemesterPercentage", "previousExamPercentage", "annualFamilyIncome",
]);
const booleanProfileFields = new Set([
  "class12Passed", "incomeCertificateAvailable", "bplStatus",
  "domicileCertificateAvailable", "aadhaarAvailable", "bankAccountAvailable",
  "netJrfQualified", "researchRegistrationWithinStipulatedPeriod",
]);

async function getStudentProfile(userId) {
  const [profile, user] = await Promise.all([
    getProfile(userId),
    User.findById(userId).select("fullName course university department").lean(),
  ]);
  if (!profile && !user) return null;
  return {
    ...(profile ?? {}),
    fullName: profile?.fullName || user?.fullName || "",
    courseName: profile?.courseName || user?.course || "",
    collegeName: profile?.collegeName || user?.university || "",
  };
}

export async function saveProfile(userId, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("Profile information must be an object.");
  }
  const serverManagedProfileFields = new Set(["_id", "user", "createdAt", "updatedAt", "profileCompletedAt"]);
  const unknownFields = Object.keys(body).filter((field) =>
    !profileFields.includes(field) && !serverManagedProfileFields.has(field));
  if (unknownFields.length) throw badRequest(`Unsupported profile field: ${unknownFields[0]}.`);
  if (!Object.keys(body).some((field) => profileFields.includes(field))) {
    throw badRequest("Enter at least one profile detail to save.");
  }

  const input = {};
  for (const [field, rawValue] of Object.entries(body)) {
    if (!profileFields.includes(field)) continue;
    if (numericProfileFields.has(field)) {
      if (rawValue === null || String(rawValue).trim() === "") {
        input[field] = null;
      } else {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) throw badRequest(`${field} must be a valid number.`);
        input[field] = value;
      }
    } else if (booleanProfileFields.has(field)) {
      if (rawValue === null || rawValue === "") {
        input[field] = null;
      } else if (rawValue === true || rawValue === "yes") {
        input[field] = true;
      } else if (rawValue === false || rawValue === "no") {
        input[field] = false;
      } else {
        throw badRequest(`${field} must be answered yes or no.`);
      }
    } else if (field === "dateOfBirth") {
      const value = rawValue ? new Date(rawValue) : null;
      if (value && Number.isNaN(value.getTime())) throw badRequest("Enter a valid date of birth.");
      if (value && value > new Date()) throw badRequest("Date of birth cannot be in the future.");
      input[field] = value;
    } else {
      input[field] = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    }
  }

  input.profileCompletedAt = new Date();
  try {
    const profile = await ScholarshipProfile.findOneAndUpdate(
      { user: userId },
      { $set: { ...input, user: userId } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    await ScholarshipEligibilityResult.deleteMany({ user: userId });
    return profile.toObject();
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
      throw badRequest(error.message);
    }
    throw error;
  }
}

const eligibilityProfileFieldAliases = {
  domicile: "domicileState",
  course: "courseName",
  academicYear: "currentAcademicYear",
  income: "annualFamilyIncome",
  minority: "minorityStatus",
  disability: "disabilityStatus",
  marks: "previousExamPercentage",
  percentage: "previousExamPercentage",
  age: "dateOfBirth",
};

function profileFieldForEligibility(field) {
  return eligibilityProfileFieldAliases[field] ?? field;
}

function valueForField(profile, field) {
  if (field === "age") {
    if (profile?.dateOfBirth) {
      const birthDate = new Date(profile.dateOfBirth);
      if (!Number.isNaN(birthDate.getTime())) {
        const now = new Date();
        return now.getFullYear() - birthDate.getFullYear() -
          (now < new Date(now.getFullYear(), birthDate.getMonth(), birthDate.getDate()) ? 1 : 0);
      }
    }
  }
  return profile?.[profileFieldForEligibility(field)];
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
  age: { label: "Date of birth", type: "date" },
  dateOfBirth: { label: "Date of birth", type: "date" },
  district: { label: "District", type: "text" },
  fullName: { label: "Full name", type: "text" },
  collegeName: { label: "College or university", type: "text" },
  universityRegistrationNumber: { label: "University registration number", type: "text" },
  tenthPercentage: { label: "10th percentage", type: "number" },
  tenthPassingYear: { label: "10th passing year", type: "number" },
  tenthSchoolState: { label: "State where your Class 10 school is located", type: "text" },
  class12Passed: { label: "Have you passed Class XII or an equivalent examination?", type: "select", options: ["yes", "no"] },
  twelfthPassingYear: { label: "12th passing year", type: "number" },
  twelfthSchoolState: { label: "State where your Class XII school is located", type: "select", options: [...northEasternStates, "Other state or union territory"] },
  twelfthPercentage: { label: "12th percentage", type: "number" },
  undergraduateFirstYear: { label: "Are you admitted to the first year of an undergraduate degree programme?", type: "select", options: ["yes", "no"] },
  admissionType: { label: "Admission mode", type: "select", options: ["regular", "distance"] },
  recognizedInstitution: { label: "Is your degree programme recognized by UGC?", type: "select", options: ["yes", "no"] },
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
  nationality: { label: "Are you an Indian student?", type: "select", options: ["Indian", "Other"] },
  firstYearPostgraduate: { label: "Are you admitted to the first year of a postgraduate degree?", type: "select", options: ["yes", "no"] },
  regularFullTime: { label: "Is your postgraduate programme regular and full-time?", type: "select", options: ["yes", "no"] },
  recognizedPgDegree: { label: "Is your postgraduate degree recognized and offered by an eligible institution?", type: "select", options: ["yes", "no"] },
  postgraduateComponent: { label: "If this is an integrated programme, are you in its postgraduate component?", type: "select", options: ["yes", "no", "not_applicable"] },
  researchRegistrationWithinStipulatedPeriod: {
    label: "Can your institution complete your M.Phil./Ph.D. registration within the stated two-year period?",
    type: "select",
    options: ["yes", "no"],
  },
};
const booleanEligibilityFields = new Set([
  "class12Passed",
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

export function getEligibilityQuestions(scholarship, profile = {}, missingFields = null) {
  const fields = missingFields
    ? new Set(missingFields.map(profileFieldForEligibility))
    : new Set(scholarshipRules(scholarship)
      .filter((rule) => rule.required !== false)
      .map((rule) => profileFieldForEligibility(rule.field)));
  if (!missingFields && scholarship.incomeLimit != null) fields.add("annualFamilyIncome");
  return [...fields]
    .filter((field) => {
      if (!Object.prototype.hasOwnProperty.call(eligibilityQuestionFields, field)) return false;
      const actual = valueForField(profile, field);
      return actual === undefined || actual === null || actual === "";
    })
    .map((field) => ({
      field,
      ...eligibilityQuestionFields[field],
    }));
}

export function mergeEligibilityAnswers(profile, answers = {}) {
  const merged = { ...(profile ?? {}) };
  for (const [field, answer] of Object.entries(answers)) {
    if (!Object.prototype.hasOwnProperty.call(eligibilityQuestionFields, field)) continue;
    const mapped = profileFieldForEligibility(field);
    merged[mapped] = booleanEligibilityFields.has(mapped)
      ? answer === true || answer === "yes"
      : answer;
  }
  return merged;
}

function evaluateRule(profile, rule) {
  const field = rule.field;
  if (!Object.prototype.hasOwnProperty.call(eligibilityQuestionFields, field)) {
    return {
      status: "verification-required",
      reason: `The requirement “${rule.reason || field}” cannot be evaluated automatically.`,
      field,
    };
  }
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
    case "gte": matched = Number.isFinite(Number(actual)) && Number.isFinite(Number(expected)) && Number(actual) >= Number(expected); break;
    case "lte": matched = Number.isFinite(Number(actual)) && Number.isFinite(Number(expected)) && Number(actual) <= Number(expected); break;
    case "gt": matched = Number.isFinite(Number(actual)) && Number.isFinite(Number(expected)) && Number(actual) > Number(expected); break;
    case "lt": matched = Number.isFinite(Number(actual)) && Number.isFinite(Number(expected)) && Number(actual) < Number(expected); break;
    case "in": matched = (Array.isArray(expected) ? expected : [expected]).some((v) => String(v).toLowerCase() === String(actual).toLowerCase()); break;
    case "nin": matched = !(Array.isArray(expected) ? expected : [expected]).some((v) => String(v).toLowerCase() === String(actual).toLowerCase()); break;
    case "exists": matched = expected ? actual !== undefined && actual !== null && actual !== "" : actual === undefined || actual === null || actual === "";
      break;
    case "contains": matched = Array.isArray(actual) ? actual.includes(expected) : String(actual).toLowerCase().includes(String(expected).toLowerCase()); break;
    default: return { status: "verification-required", reason: `The ${field} rule uses an unsupported comparison.`, field };
  }
  if ((!Number.isFinite(Number(actual)) || !Number.isFinite(Number(expected))) &&
      ["gte", "lte", "gt", "lt"].includes(rule.operator)) {
    return { status: "verification-required", reason: `The ${field} value cannot be verified.`, field };
  }
  if (rule.verificationRequired && matched) {
    return { status: "verification-required", reason: rule.reason || `The ${field} requirement needs official verification.`, field };
  }
  return matched
    ? { status: "passed", field }
    : { status: "failed", reason: rule.reason || `Does not meet the ${field} requirement.`, field };
}

export function evaluateEligibility(profile, scholarship) {
  if (!scholarshipRules(scholarship).length && scholarship.incomeLimit == null) {
    return {
      result: "VERIFICATION_REQUIRED",
      reasons: [],
      missingFields: [],
      questions: [],
      verificationRequired: ["Official eligibility criteria are not available in the catalog."],
      criteria: [],
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
  const verificationRequired = [];
  let verificationBlocksResult = false;
  const criteria = [];
  const addCriterion = (rule, evaluated) => {
    const status = {
      passed: "MET",
      failed: "NOT_MET",
      missing: "MISSING",
      "verification-required": "VERIFICATION_REQUIRED",
      "optional-missing": "NOT_APPLICABLE",
    }[evaluated.status] ?? "VERIFICATION_REQUIRED";
    criteria.push({
      field: profileFieldForEligibility(rule.field),
      label: eligibilityQuestionFields[rule.field]?.label ?? rule.field,
      requirement: rule.reason || `${rule.field} ${rule.operator} ${String(rule.value ?? "")}`,
      status,
    });
  };
  for (const rule of rules) {
    const evaluated = evaluateRule(profile, rule);
    addCriterion(rule, evaluated);
    if (evaluated.status === "missing") missing.push(profileFieldForEligibility(evaluated.field));
    if (evaluated.status === "failed") reasons.push(evaluated.reason);
    if (evaluated.status === "verification-required") {
      verificationRequired.push(evaluated.reason);
      if (!rule.verificationRequired) verificationBlocksResult = true;
    }
  }

  const hasAnnualIncomeRule = scholarshipRules(scholarship)
    .some((rule) => profileFieldForEligibility(rule.field) === "annualFamilyIncome");
  if (scholarship.incomeLimit != null && !hasAnnualIncomeRule) {
    if (profile.annualFamilyIncome == null || profile.annualFamilyIncome === "") {
      missing.push("annualFamilyIncome");
      criteria.push({
        field: "annualFamilyIncome",
        label: eligibilityQuestionFields.annualFamilyIncome.label,
        requirement: `Annual family income must not exceed ₹${Number(scholarship.incomeLimit).toLocaleString("en-IN")}.`,
        status: "MISSING",
      });
    } else if (!Number.isFinite(Number(profile.annualFamilyIncome))) {
      verificationRequired.push("Annual family income could not be verified.");
      verificationBlocksResult = true;
    } else if (Number(profile.annualFamilyIncome) > Number(scholarship.incomeLimit)) {
      reasons.push(`Your annual family income exceeds the maximum income limit of ₹${Number(scholarship.incomeLimit).toLocaleString("en-IN")}.`);
      criteria.push({
        field: "annualFamilyIncome",
        label: eligibilityQuestionFields.annualFamilyIncome.label,
        requirement: `Annual family income must not exceed ₹${Number(scholarship.incomeLimit).toLocaleString("en-IN")}.`,
        status: "NOT_MET",
      });
    } else {
      criteria.push({
        field: "annualFamilyIncome",
        label: eligibilityQuestionFields.annualFamilyIncome.label,
        requirement: `Annual family income must not exceed ₹${Number(scholarship.incomeLimit).toLocaleString("en-IN")}.`,
        status: "MET",
      });
    }
  }

  const groups = Array.isArray(scholarship.eligibilityGroups) ? scholarship.eligibilityGroups : [];
  for (const group of groups) {
    if (!Array.isArray(group.rules) || group.rules.length === 0) continue;
    const evaluated = group.rules.map((rule) => evaluateRule(profile, rule));
    const missingGroup = evaluated.filter((item) => item.status === "missing");
    const failedGroup = evaluated.filter((item) => item.status === "failed");
    const verificationGroup = evaluated.filter((item) => item.status === "verification-required");
    if (group.operator === "OR") {
      if (evaluated.some((item) => item.status === "passed")) {
        criteria.push({
          field: "eligibility-group",
          label: group.reason || "One of the following requirements",
          requirement: group.reason || "At least one eligibility option must be met.",
          status: "MET",
        });
      } else if (missingGroup.length) {
        missing.push(...missingGroup.map((item) => profileFieldForEligibility(item.field)));
        criteria.push({
          field: "eligibility-group",
          label: group.reason || "One of the following requirements",
          requirement: group.reason || "At least one eligibility option must be met.",
          status: "MISSING",
        });
      } else if (verificationGroup.length) {
        verificationRequired.push(...verificationGroup.map((item) => item.reason));
        criteria.push({
          field: "eligibility-group",
          label: group.reason || "One of the following requirements",
          requirement: group.reason || "At least one eligibility option must be met.",
          status: "VERIFICATION_REQUIRED",
        });
        verificationGroup.forEach((item) => {
          const matchingRule = group.rules.find((rule) => rule.field === item.field);
          if (!matchingRule?.verificationRequired) verificationBlocksResult = true;
        });
      } else {
        reasons.push(group.reason || failedGroup.map((item) => item.reason).join(" or "));
        criteria.push({
          field: "eligibility-group",
          label: group.reason || "One of the following requirements",
          requirement: group.reason || "At least one eligibility option must be met.",
          status: "NOT_MET",
        });
      }
    } else if (group.operator === "AND") {
      for (let index = 0; index < group.rules.length; index += 1) {
        addCriterion(group.rules[index], evaluated[index]);
      }
      if (missingGroup.length) missing.push(...missingGroup.map((item) => profileFieldForEligibility(item.field)));
      if (failedGroup.length) reasons.push(...failedGroup.map((item) => item.reason));
      if (verificationGroup.length) {
        verificationRequired.push(...verificationGroup.map((item) => item.reason));
        verificationGroup.forEach((item) => {
          const matchingRule = group.rules.find((rule) => rule.field === item.field);
          if (!matchingRule?.verificationRequired) verificationBlocksResult = true;
        });
      }
    } else {
      verificationRequired.push("An eligibility condition group uses an unsupported combination rule.");
      verificationBlocksResult = true;
      criteria.push({
        field: "eligibility-group",
        label: "Eligibility condition group",
        requirement: "The relationship between grouped requirements needs official review.",
        status: "VERIFICATION_REQUIRED",
      });
    }
  }

  const uniqueMissing = [...new Set(missing)];
  const uniqueReasons = [...new Set(reasons)];
  const uniqueVerificationRequired = [...new Set(verificationRequired)];
  let result = "ELIGIBLE";
  if (uniqueMissing.length) result = "MORE_INFORMATION_REQUIRED";
  else if (uniqueReasons.length) result = "NOT_ELIGIBLE";
  else if (uniqueVerificationRequired.length && verificationBlocksResult) result = "VERIFICATION_REQUIRED";
  return {
    result,
    reasons: uniqueReasons,
    missingFields: uniqueMissing,
    questions: result === "MORE_INFORMATION_REQUIRED"
      ? getEligibilityQuestions(scholarship, profile, uniqueMissing)
      : [],
    verificationRequired: uniqueVerificationRequired,
    criteria,
    criteriaAvailable: true,
    estimated: true,
    sourceUrl: scholarship.officialSourceUrl,
  };
}

async function prepareEligibilityScholarship(scholarship) {
  const hasUgcSource = scholarship.sourceName === "University Grants Commission" ||
    scholarship.sourceHistory?.some((entry) => entry?.sourceName === "University Grants Commission") ||
    scholarship.officialSourceUrl?.includes("ugc.gov.in");
  if (!scholarship.eligibilityRules?.length && hasUgcSource) {
    const extractedRules = extractUgcEligibilityRules(scholarship.educationalRequirements);
    const ishanUdayRules = getOfficialIshanUdayEligibilityRules(scholarship);
    const eligibilityRules = ishanUdayRules.length
      ? ishanUdayRules
      : extractedRules.length
        ? extractedRules
        : getOfficialUgcPgEligibilityRules(scholarship);
    if (eligibilityRules.length) {
      scholarship.eligibilityRules = eligibilityRules;
      if (getOfficialIshanUdayEligibilityRules(scholarship).length) scholarship.incomeLimit = 450000;
      await scholarship.save();
    }
  }
  return scholarship;
}

export async function getEligibilityProfileRequirements(userId, scholarshipId) {
  const scholarship = await Scholarship.findById(scholarshipId);
  if (!scholarship) {
    const error = new Error("Scholarship not found.");
    error.statusCode = 404;
    throw error;
  }
  await prepareEligibilityScholarship(scholarship);
  const profile = await getStudentProfile(userId) ?? {};
  const result = evaluateEligibility(profile, scholarship.toObject());
  const requiredFields = new Set(scholarshipRules(scholarship.toObject())
    .filter((rule) => rule.required !== false)
    .map((rule) => profileFieldForEligibility(rule.field))
    .filter((field) => Object.prototype.hasOwnProperty.call(eligibilityQuestionFields, field)));
  if (scholarship.incomeLimit != null) requiredFields.add("annualFamilyIncome");

  const hasAnnualIncomeRule = scholarshipRules(scholarship.toObject())
    .some((rule) => profileFieldForEligibility(rule.field) === "annualFamilyIncome");
  const requiredCriteriaCount = (scholarship.eligibilityRules ?? [])
    .filter((rule) => rule.required !== false).length +
    (Array.isArray(scholarship.eligibilityGroups) ? scholarship.eligibilityGroups : []).reduce((count, group) =>
      count + (group.operator === "OR" ? 1 : (group.rules ?? []).filter((rule) => rule.required !== false).length), 0) +
    (scholarship.incomeLimit != null && !hasAnnualIncomeRule ? 1 : 0);
  const missingCriteriaCount = result.criteria.filter((criterion) => criterion.status === "MISSING").length;
  const completedCriteriaCount = Math.max(0, requiredCriteriaCount - missingCriteriaCount);
  return {
    profile,
    requirements: {
      requiredFields: [...requiredFields].map((field) => ({
        field,
        ...eligibilityQuestionFields[field],
      })),
      missingFields: result.missingFields,
      questions: result.questions,
      criteria: result.criteria,
      verificationRequired: result.verificationRequired,
      progress: {
        completed: Math.min(completedCriteriaCount, requiredCriteriaCount),
        total: requiredCriteriaCount,
        percentage: requiredCriteriaCount
          ? Math.round((completedCriteriaCount / requiredCriteriaCount) * 100)
          : 100,
      },
    },
  };
}

export async function checkEligibility(userId, scholarshipId, answers = {}) {
  const scholarship = await Scholarship.findById(scholarshipId);
  if (!scholarship) {
    const error = new Error("Scholarship not found.");
    error.statusCode = 404;
    throw error;
  }
  await prepareEligibilityScholarship(scholarship);
  const applicableFields = new Set(scholarshipRules(scholarship.toObject())
    .map((rule) => profileFieldForEligibility(rule.field)));
  if (scholarship.incomeLimit != null) applicableFields.add("annualFamilyIncome");
  const persistedAnswers = {};
  for (const [field, answer] of Object.entries(answers)) {
    const profileField = profileFieldForEligibility(field);
    if (!applicableFields.has(profileField) ||
        !Object.prototype.hasOwnProperty.call(eligibilityQuestionFields, field)) {
      throw badRequest(`The ${field} answer is not required by this scholarship.`);
    }
    if (!profileFields.includes(profileField)) {
      throw badRequest(`The ${field} answer cannot be saved to the scholarship profile.`);
    }
    persistedAnswers[profileField] = answer;
  }

  if (Object.keys(persistedAnswers).length) {
    await saveProfile(userId, persistedAnswers);
  }
  const [profile, profileRecord] = await Promise.all([
    getStudentProfile(userId),
    ScholarshipProfile.findOne({ user: userId }).select("updatedAt").lean(),
  ]);
  const evaluation = evaluateEligibility(profile, scholarship.toObject());
  const evaluatedAt = new Date();
  const savedResult = await ScholarshipEligibilityResult.findOneAndUpdate(
    { user: userId, scholarship: scholarship._id },
    {
      $set: {
        result: evaluation.result,
        reasons: evaluation.reasons,
        missingFields: evaluation.missingFields,
        verificationRequired: evaluation.verificationRequired,
        criteria: evaluation.criteria,
        evaluatedAt,
        profileUpdatedAt: profileRecord?.updatedAt ?? null,
        scholarshipUpdatedAt: scholarship.updatedAt ?? null,
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return {
    ...evaluation,
    eligibilityResultId: savedResult._id.toString(),
    evaluatedAt,
  };
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
  const profile = await getStudentProfile(userId);
  const eligibility = evaluateEligibility(profile, scholarship.toObject());
  if (eligibility.result === "NOT_ELIGIBLE") throw badRequest("This scholarship result is not eligible.");
  if (eligibility.result === "MORE_INFORMATION_REQUIRED") throw badRequest("Complete the missing scholarship profile information first.");
  if (eligibility.result === "VERIFICATION_REQUIRED") throw badRequest("Official verification is required before continuing to the application.");
  const application = await ScholarshipApplication.findOneAndUpdate(
    { user: userId, scholarship: scholarshipId },
    { $set: { eligibilityResult: eligibility, redirectedAt: new Date(), status: "intended" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return { applicationId: application._id, officialApplicationUrl: scholarship.officialApplicationUrl, eligibility };
}
