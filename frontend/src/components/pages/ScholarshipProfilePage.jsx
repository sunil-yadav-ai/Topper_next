"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api.js";

export default function ScholarshipProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scholarshipId = searchParams.get("scholarshipId");
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasProfile, setHasProfile] = useState(false);
  const [requirements, setRequirements] = useState(null);
  const [savedForEligibility, setSavedForEligibility] = useState(false);
  const [profile, setProfile] = useState({
    fullName: "", dateOfBirth: "", gender: "", state: "", district: "", domicileState: "",
    category: "", minorityStatus: "", disabilityStatus: "", educationLevel: "", courseName: "",
    currentAcademicYear: "", collegeName: "", universityRegistrationNumber: "",
    tenthPercentage: "", twelfthPercentage: "", currentSemesterPercentage: "", previousExamPercentage: "",
    tenthPassingYear: "", tenthSchoolState: "", twelfthPassingYear: "", twelfthSchoolState: "",
    class12Passed: "", undergraduateFirstYear: "", admissionType: "", recognizedInstitution: "",
    annualFamilyIncome: "", incomeCertificateAvailable: false, bplStatus: false,
    residenceType: "", domicileCertificateAvailable: false, aadhaarAvailable: false, bankAccountAvailable: false,
    nationality: "", firstYearPostgraduate: "", regularFullTime: "",
    recognizedPgDegree: "", postgraduateComponent: "",
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setRequirements(null);
    const profileRequest = scholarshipId
      ? api.get(`/scholarships/profile/eligibility/${encodeURIComponent(scholarshipId)}`)
      : api.get("/scholarships/profile");
    profileRequest
      .then(({ data }) => {
        if (!active) return;
        const savedProfile = data.profile;
        if (scholarshipId) setRequirements(data.requirements);
        if (savedProfile) {
          setHasProfile(Boolean(savedProfile._id));
          setProfile((current) => ({
            ...current,
            ...savedProfile,
            dateOfBirth: savedProfile.dateOfBirth ? savedProfile.dateOfBirth.slice(0, 10) : "",
          }));
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.message ||
            (requestError.response?.status === 401 ? "Your session expired. Sign in again." : "Could not load profile.")
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scholarshipId]);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setProfile((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const returnTo = searchParams.get("returnTo");
      if (scholarshipId) {
        const questions = requirements?.questions ?? [];
        const missingQuestion = questions.find((question) => String(profile[question.field] ?? "").trim() === "");
        if (missingQuestion) {
          setError(`Complete the required information: ${missingQuestion.label}.`);
          return;
        }
        const updates = Object.fromEntries(questions.map((question) => [
          question.field,
          profile[question.field],
        ]));
        if (hasProfile) await api.put("/scholarships/profile", updates);
        else await api.post("/scholarships/profile", updates);
        setSavedForEligibility(true);
        return;
      } else {
        if (profile.annualFamilyIncome !== "" && Number(profile.annualFamilyIncome) < 0) {
          setError("Annual family income cannot be negative.");
          return;
        }
        if (hasProfile) await api.put("/scholarships/profile", profile);
        else await api.post("/scholarships/profile", profile);
      }
      if (returnTo && returnTo.startsWith("/scholarships/")) {
        router.replace(`${returnTo}${returnTo.includes("?") ? "&" : "?"}profileCompleted=true`);
      } else {
        router.replace("/my-scholarships");
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  const field = (name, label, options = {}) => (
    <label className="block text-sm font-bold text-[#615a4f]" key={name}>{label}
      {options.select ? (
        <select className="mt-2 w-full rounded-xl border-2 border-[#171717]/20 bg-white px-3 py-3 text-[#171717]" name={name} value={typeof profile[name] === "boolean" ? profile[name] ? "yes" : "no" : profile[name]} onChange={update} required={options.required}>
          <option value="">Select</option>{options.select.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      ) : (
        <input className="mt-2 w-full rounded-xl border-2 border-[#171717]/20 bg-white px-3 py-3 text-[#171717]" name={name} type={options.type || "text"} value={profile[name] ?? ""} onChange={update} required={options.required} min={options.min} max={options.max} />
      )}
      {options.help && <span className="mt-1 block text-xs font-normal">{options.help}</span>}
    </label>
  );

  const steps = [
    <div className="grid gap-4 sm:grid-cols-2" key="personal">
      {field("fullName", "Full name", { required: true })}
      {field("dateOfBirth", "Date of birth", { required: true, type: "date" })}
      {field("gender", "Gender", { required: true, select: ["female", "male", "other", "prefer_not_to_say"] })}
      {field("state", "State", { required: true })}
      {field("district", "District", { required: true })}
      {field("domicileState", "Domicile state", { required: true })}
      {field("category", "Category (optional)", { select: ["", "general", "sc", "st", "obc", "ews", "other"] })}
      {field("minorityStatus", "Minority status (optional)", { select: ["", "yes", "no"] })}
      {field("disabilityStatus", "Disability status (optional)", { select: ["", "none", "yes"] })}
    </div>,
    <div className="grid gap-4 sm:grid-cols-2" key="education">
      {field("educationLevel", "Current education level", { required: true })}
      {field("courseName", "Course name", { required: true })}
      {field("currentAcademicYear", "Current academic year", { required: true })}
      {field("collegeName", "College or university name", { required: true })}
      {field("universityRegistrationNumber", "University registration number (if required)", { help: "Leave blank if the scholarship does not require it." })}
      {field("nationality", "Nationality", { select: ["", "Indian", "Other"] })}
      {field("firstYearPostgraduate", "First year of postgraduate study?", { select: ["", "yes", "no"] })}
      {field("regularFullTime", "Postgraduate study is regular/full-time?", { select: ["", "yes", "no"] })}
      {field("recognizedPgDegree", "Recognized postgraduate degree?", { select: ["", "yes", "no"] })}
      {field("postgraduateComponent", "Integrated course postgraduate component", { select: ["", "yes", "no", "not_applicable"] })}
      {field("tenthPassingYear", "10th passing year", { type: "number", min: 1950, max: 2100 })}
      {field("tenthSchoolState", "10th school state")}
      {field("tenthPercentage", "10th percentage", { type: "number", min: 0, max: 100 })}
      {field("twelfthPassingYear", "12th passing year", { type: "number", min: 1950, max: 2100 })}
      {field("twelfthSchoolState", "12th school state")}
      {field("twelfthPercentage", "12th percentage", { type: "number", min: 0, max: 100 })}
      {field("class12Passed", "Passed Class XII or equivalent?", { select: ["yes", "no"] })}
      {field("undergraduateFirstYear", "First year of undergraduate degree?", { select: ["yes", "no"] })}
      {field("admissionType", "Admission type", { select: ["regular", "distance"] })}
      {field("recognizedInstitution", "Degree programme recognized by UGC?", { select: ["yes", "no"] })}
      {field("currentSemesterPercentage", "Current semester percentage", { type: "number", min: 0, max: 100 })}
      {field("previousExamPercentage", "Previous examination percentage", { type: "number", min: 0, max: 100 })}
    </div>,
    <div className="grid gap-4 sm:grid-cols-2" key="financial">
      {field("annualFamilyIncome", "Annual family income (₹)", { required: true, type: "number", min: 0, help: "Used only to estimate income-based eligibility." })}
      {[
        ["incomeCertificateAvailable", "Income certificate is available"],
        ["bplStatus", "Applicable BPL status"],
        ["domicileCertificateAvailable", "Domicile certificate is available"],
        ["aadhaarAvailable", "Aadhaar is available, if relevant"],
        ["bankAccountAvailable", "Bank account is available, if relevant"],
      ].map(([name, label]) => (
        <label className="flex items-center gap-3 rounded-xl border border-[#171717]/15 bg-white px-4 py-3 text-sm font-bold" key={name}>
          <input name={name} type="checkbox" checked={Boolean(profile[name])} onChange={update} />{label}
        </label>
      ))}
      {field("residenceType", "Hostel or day scholar", { select: ["", "hostel", "day_scholar"] })}
    </div>,
  ];

  if (loading) return <main className="mx-auto max-w-4xl px-4 py-16"><div className="h-96 animate-pulse rounded-3xl bg-white" /></main>;

  if (scholarshipId) {
    const questions = requirements?.questions ?? [];
    const requiredFields = requirements?.requiredFields ?? [];
    const displayValue = (fieldName) => {
      const value = profile[fieldName];
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (value === "yes") return "Yes";
      if (value === "no") return "No";
      return String(value ?? "");
    };
    const savedRequirements = requiredFields.filter((item) =>
      !questions.some((question) => question.field === item.field) &&
      displayValue(item.field).trim() !== "");
    const progress = requirements?.progress ?? { completed: 0, total: requiredFields.length, percentage: 0 };
    const returnTo = searchParams.get("returnTo");

    return (
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
        <section className="rounded-3xl border-2 border-[#171717] bg-white p-5 shadow-[6px_6px_0_#171717] sm:p-8">
          <p className="text-xs font-black uppercase tracking-wider text-[#9270e8]">Scholarship eligibility details</p>
          <h1 className="mt-2 text-3xl font-black">Complete only the missing information</h1>
          <p className="mt-2 text-sm text-[#615a4f]">Your saved information is kept in your existing scholarship profile. Only details required by this scholarship are requested here.</p>
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-sm font-bold">
              <span>Eligibility information progress</span>
              <span>{progress.completed} of {progress.total} conditions</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={progress.percentage} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[#c8ef16] transition-all" style={{ width: `${progress.percentage}%` }} />
            </div>
          </div>
          {savedRequirements.length > 0 && (
            <section className="mt-6 rounded-2xl bg-[#f7f5ef] p-4">
              <h2 className="font-black">Already saved</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {savedRequirements.map((item) => (
                  <li className="rounded-xl bg-white p-3 text-sm" key={item.field}>
                    <span className="block text-xs font-bold text-[#615a4f]">{item.label}</span>
                    <span className="mt-1 block font-black">{displayValue(item.field) || "Saved"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {savedForEligibility ? (
            <div className="mt-7">
              <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800" role="status">
                Your missing information has been saved securely. Return to the scholarship to run the eligibility check.
              </p>
              <button
                className="mt-5 rounded-xl border-2 border-[#171717] bg-[#c8ef16] px-5 py-3 font-black"
                disabled={!returnTo?.startsWith("/scholarships/")}
                onClick={() => router.replace(`${returnTo}?profileCompleted=true`)}
                type="button"
              >
                Return to eligibility check
              </button>
            </div>
          ) : questions.length > 0 ? (
            <form className="mt-7 space-y-4" onSubmit={(event) => {
              event.preventDefault();
              save();
            }}>
              <h2 className="font-black">Information still required</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {questions.map((question) => (
                  <label className="block text-sm font-bold text-[#615a4f]" key={question.field}>
                    {question.label}
                    {question.type === "select" ? (
                      <select
                        className="mt-2 w-full rounded-xl border-2 border-[#171717]/20 bg-white px-3 py-3 text-[#171717]"
                        required
                        value={typeof profile[question.field] === "boolean"
                          ? profile[question.field] ? "yes" : "no"
                          : profile[question.field] ?? ""}
                        onChange={(event) => setProfile((current) => ({ ...current, [question.field]: event.target.value }))}
                      >
                        <option value="">Select</option>
                        {question.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input
                        className="mt-2 w-full rounded-xl border-2 border-[#171717]/20 bg-white px-3 py-3 text-[#171717]"
                        max={question.type === "number" && question.field.toLowerCase().includes("percentage") ? 100 : undefined}
                        min={question.type === "number" ? 0 : undefined}
                        required
                        type={question.type}
                        value={profile[question.field] ?? ""}
                        onChange={(event) => setProfile((current) => ({ ...current, [question.field]: event.target.value }))}
                      />
                    )}
                  </label>
                ))}
              </div>
              {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
              <button className="w-full rounded-xl border-2 border-[#171717] bg-[#c8ef16] px-5 py-3 font-black sm:w-auto" disabled={saving} type="submit">
                {saving ? "Saving…" : "Save missing information and check eligibility"}
              </button>
            </form>
          ) : (
            <div className="mt-7">
              <p className="rounded-xl bg-[#fff8eb] p-4 text-sm">
                {requirements?.verificationRequired?.length
                  ? "No additional profile information is needed, but one or more conditions require official verification."
                  : "No additional information is required for this scholarship."}
              </p>
              {requirements?.verificationRequired?.map((reason) => <p className="mt-2 text-sm" key={reason}>{reason}</p>)}
              {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
              <button
                className="mt-5 rounded-xl border-2 border-[#171717] bg-[#ffd943] px-5 py-3 font-black"
                disabled={!returnTo?.startsWith("/scholarships/")}
                onClick={() => router.replace(`${returnTo}?profileCompleted=true`)}
                type="button"
              >
                Return to eligibility check
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
      <section className="rounded-3xl border-2 border-[#171717] bg-white p-5 shadow-[6px_6px_0_#171717] sm:p-8">
        <p className="text-xs font-black uppercase tracking-wider text-[#9270e8]">Secure scholarship profile</p>
        <h1 className="mt-2 text-3xl font-black">{hasProfile ? "Update your eligibility profile" : "Complete your eligibility profile"}</h1>
        <p className="mt-2 text-sm text-[#615a4f]">Fill in your details once and update them whenever they change. We collect only information needed to estimate scholarship eligibility. Aadhaar numbers and government passwords are never requested.</p>
        <div className="mt-6 flex gap-2">{steps.map((_, index) => <span className={`h-2 flex-1 rounded-full ${index <= step ? "bg-[#c8ef16]" : "bg-slate-200"}`} key={index} />)}</div>
        <div className="mt-7">{steps[step]}</div>
        {error && <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
        <div className="mt-7 flex justify-between gap-3">
          <button className="rounded-xl border-2 border-[#171717] px-5 py-3 font-black" disabled={step === 0} onClick={() => setStep((value) => value - 1)} type="button">Back</button>
          {step < steps.length - 1 ? (
            <button className="rounded-xl border-2 border-[#171717] bg-[#ffd943] px-5 py-3 font-black" onClick={() => setStep((value) => value + 1)} type="button">Save and Continue</button>
          ) : (
            <button className="rounded-xl border-2 border-[#171717] bg-[#c8ef16] px-5 py-3 font-black" disabled={saving} onClick={save} type="button">{saving ? "Saving…" : hasProfile ? "Update Profile" : "Save Profile"}</button>
          )}
        </div>
      </section>
    </main>
  );
}
