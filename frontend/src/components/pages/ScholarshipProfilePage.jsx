"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api.js";

export default function ScholarshipProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState({
    fullName: "", dateOfBirth: "", gender: "", state: "", district: "", domicileState: "",
    category: "", minorityStatus: "", disabilityStatus: "", educationLevel: "", courseName: "",
    currentAcademicYear: "", collegeName: "", universityRegistrationNumber: "",
    tenthPercentage: "", twelfthPercentage: "", currentSemesterPercentage: "", previousExamPercentage: "",
    annualFamilyIncome: "", incomeCertificateAvailable: false, bplStatus: false,
    residenceType: "", domicileCertificateAvailable: false, aadhaarAvailable: false, bankAccountAvailable: false,
  });

  useEffect(() => {
    api.get("/scholarships/profile")
      .then(({ data }) => { if (data.profile) setProfile((current) => ({ ...current, ...data.profile, dateOfBirth: data.profile.dateOfBirth ? data.profile.dateOfBirth.slice(0, 10) : "" })); })
      .catch((requestError) => setError(requestError.response?.data?.message ?? "Could not load profile."))
      .finally(() => setLoading(false));
  }, []);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setProfile((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api.post("/scholarships/profile", profile);
      const returnTo = searchParams.get("returnTo");
      router.replace(returnTo && returnTo.startsWith("/scholarships/") ? `${returnTo}?profileCompleted=true` : "/my-scholarships");
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  const field = (name, label, options = {}) => (
    <label className="block text-sm font-bold text-[#615a4f]" key={name}>{label}
      {options.select ? (
        <select className="mt-2 w-full rounded-xl border-2 border-[#171717]/20 bg-white px-3 py-3 text-[#171717]" name={name} value={profile[name]} onChange={update} required={options.required}>
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
      {field("tenthPercentage", "10th percentage", { type: "number", min: 0, max: 100 })}
      {field("twelfthPercentage", "12th percentage", { type: "number", min: 0, max: 100 })}
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

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
      <section className="rounded-3xl border-2 border-[#171717] bg-white p-5 shadow-[6px_6px_0_#171717] sm:p-8">
        <p className="text-xs font-black uppercase tracking-wider text-[#9270e8]">Secure scholarship profile</p>
        <h1 className="mt-2 text-3xl font-black">Complete your eligibility profile</h1>
        <p className="mt-2 text-sm text-[#615a4f]">We collect only the information needed to estimate scholarship eligibility. Aadhaar numbers and government passwords are never requested.</p>
        <div className="mt-6 flex gap-2">{steps.map((_, index) => <span className={`h-2 flex-1 rounded-full ${index <= step ? "bg-[#c8ef16]" : "bg-slate-200"}`} key={index} />)}</div>
        <div className="mt-7">{steps[step]}</div>
        {error && <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
        <div className="mt-7 flex justify-between gap-3">
          <button className="rounded-xl border-2 border-[#171717] px-5 py-3 font-black" disabled={step === 0} onClick={() => setStep((value) => value - 1)} type="button">Back</button>
          {step < steps.length - 1 ? (
            <button className="rounded-xl border-2 border-[#171717] bg-[#ffd943] px-5 py-3 font-black" onClick={() => setStep((value) => value + 1)} type="button">Save and Continue</button>
          ) : (
            <button className="rounded-xl border-2 border-[#171717] bg-[#c8ef16] px-5 py-3 font-black" disabled={saving} onClick={save} type="button">{saving ? "Saving…" : "Review and Save"}</button>
          )}
        </div>
      </section>
    </main>
  );
}
