"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ExternalLink, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api.js";
import { eligibilityNeedsProfile } from "../../lib/scholarship-profile.js";
import { useAuth } from "../../context/AuthContext.jsx";

export default function ScholarshipDetailsPage({ slug }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [scholarship, setScholarship] = useState(null);
  const [error, setError] = useState("");
  const [eligibility, setEligibility] = useState(null);
  const [working, setWorking] = useState(false);
  const autoCheckStarted = useRef(false);

  useEffect(() => {
    api.get(`/scholarships/${encodeURIComponent(slug)}`)
      .then(({ data }) => setScholarship(data.scholarship))
      .catch((requestError) => setError(requestError.response?.data?.message ?? "Could not load scholarship."));
  }, [slug]);

  useEffect(() => {
    if (
      !autoCheckStarted.current &&
      new URLSearchParams(window.location.search).get("profileCompleted") === "true" &&
      user &&
      scholarship
    ) {
      autoCheckStarted.current = true;
      checkEligibility();
    }
  }, [user, scholarship]);

  async function checkEligibility() {
    if (!scholarship) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/scholarships/${slug}`)}`);
      return;
    }
    setWorking(true);
    setError("");
    try {
      const eligibilityResponse = await api.post("/scholarships/check-eligibility", { scholarshipId: scholarship.id });
      if (eligibilityNeedsProfile(eligibilityResponse.data)) {
        setEligibility(null);
        router.push(`/scholarships/complete-profile?scholarshipId=${encodeURIComponent(scholarship.id)}&returnTo=${encodeURIComponent(`/scholarships/${slug}`)}`);
        return;
      }
      setEligibility(eligibilityResponse.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Could not check eligibility.");
    } finally {
      setWorking(false);
    }
  }

  async function continueToApply() {
    setWorking(true);
    setError("");
    try {
      const { data } = await api.post("/scholarships/applications", {
        scholarshipId: scholarship.id,
      });
      window.location.assign(data.officialApplicationUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Could not open the application portal.");
    } finally {
      setWorking(false);
    }
  }

  if (error && !scholarship) return <main className="mx-auto max-w-5xl px-4 py-16"><p className="rounded-xl bg-rose-50 p-4 text-rose-700" role="alert">{error}</p></main>;
  if (!scholarship) return <main className="mx-auto max-w-5xl px-4 py-16"><div className="h-96 animate-pulse rounded-3xl bg-white" /></main>;

  const guidelineUrl = scholarship.officialGuidelineUrl ||
    (/^https:\/\/scholarships\.gov\.in\/.*\.pdf(?:$|[?#])/i.test(scholarship.officialSourceUrl ?? "")
      ? scholarship.officialSourceUrl
      : "");
  const missingOfficialField = "This detail is not listed in the NSP summary. See the official scheme document below.";
  const canContinueToApply = eligibility?.result === "ELIGIBLE" &&
    eligibility.criteriaAvailable &&
    scholarship.open &&
    Boolean(scholarship.officialApplicationUrl);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
      <section className="rounded-3xl border-2 border-[#171717] bg-white p-6 shadow-[6px_6px_0_#171717] sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${scholarship.open ? "bg-[#c8ef16]" : "bg-slate-200"}`}>{scholarship.open ? "OPEN" : scholarship.applicationStatus === "closed" ? "CLOSED" : "STATUS NOT CONFIRMED"}</span>
          <span className="rounded-full bg-[#f2ecff] px-3 py-1 text-xs font-bold">{scholarship.verificationStatus}</span>
        </div>
        <h1 className="mt-5 text-3xl font-black sm:text-5xl">{scholarship.title}</h1>
        <p className="mt-2 text-lg font-bold text-[#9270e8]">{scholarship.organization}</p>
        <p className="mt-5 max-w-3xl text-[#615a4f]">{scholarship.description}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#fff8eb] p-4"><span className="text-xs font-bold uppercase text-[#615a4f]">Benefit</span><p className="mt-1 font-black">{typeof scholarship.amount === "number" ? `₹${scholarship.amount.toLocaleString("en-IN")}` : scholarship.amount?.display || "Refer to Official Notification"}</p></div>
          <div className="rounded-xl bg-[#fff8eb] p-4"><span className="text-xs font-bold uppercase text-[#615a4f]">Deadline</span><p className="mt-1 flex items-center gap-2 font-black"><CalendarDays size={16} />{scholarship.applicationDeadline ? new Date(scholarship.applicationDeadline).toLocaleDateString("en-IN") : "Check Official Website"}</p></div>
          <div className="rounded-xl bg-[#fff8eb] p-4"><span className="text-xs font-bold uppercase text-[#615a4f]">Category</span><p className="mt-1 font-black">{scholarship.category?.join(", ") || scholarship.scholarshipType || "General"}</p></div>
          {scholarship.academicYear && <div className="rounded-xl bg-[#fff8eb] p-4 sm:col-span-3"><span className="text-xs font-bold uppercase text-[#615a4f]">Academic year</span><p className="mt-1 font-black">{scholarship.academicYear}</p></div>}
          <div className="rounded-xl bg-[#fff8eb] p-4"><span className="text-xs font-bold uppercase text-[#615a4f]">Application starts</span><p className="mt-1 font-black">{scholarship.applicationStartDate ? new Date(scholarship.applicationStartDate).toLocaleDateString("en-IN") : "Check Official Website"}</p></div>
          <div className="rounded-xl bg-[#fff8eb] p-4"><span className="text-xs font-bold uppercase text-[#615a4f]">Last verified</span><p className="mt-1 font-black">{scholarship.lastVerifiedAt ? new Date(scholarship.lastVerifiedAt).toLocaleDateString("en-IN") : "Not verified"}</p></div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          {[
            ["Benefits", scholarship.benefits?.length ? scholarship.benefits.map((item) => <p key={item}>{item}</p>) : missingOfficialField],
            ["Educational requirements", scholarship.educationalRequirements || missingOfficialField],
            ["Eligibility", scholarship.eligibilityRules?.length ? scholarship.eligibilityRules.map((rule) => <p key={`${rule.field}-${rule.operator}`}>{rule.reason || `${rule.field} ${rule.operator} ${String(rule.value ?? "")}`}</p>) : missingOfficialField],
            ["Income requirements", scholarship.incomeLimit != null ? `Annual family income must not exceed ₹${Number(scholarship.incomeLimit).toLocaleString("en-IN")}.` : missingOfficialField],
            ["State requirements", scholarship.stateRequirements?.length ? scholarship.stateRequirements.join(", ") : missingOfficialField],
            ["Category requirements", scholarship.categoryRequirements?.length ? scholarship.categoryRequirements.join(", ") : missingOfficialField],
            ["Required documents", scholarship.requiredDocuments?.length ? <ul className="list-disc pl-5">{scholarship.requiredDocuments.map((item) => <li key={item}>{item}</li>)}</ul> : missingOfficialField],
            ["Selection process", scholarship.selectionProcess || missingOfficialField],
            ["Application instructions", scholarship.applicationInstructions || missingOfficialField],
          ].map(([title, content]) => (
            <section className="rounded-2xl border border-[#171717]/15 bg-white p-5" key={title}>
              <h2 className="text-xl font-black">{title}</h2>
              <div className="mt-3 text-sm leading-7 text-[#615a4f]">{content}</div>
            </section>
          ))}
          <section className="rounded-2xl border-2 border-[#171717]/15 bg-white p-5">
            <h2 className="text-xl font-black">Official scheme document</h2>
            <p className="mt-2 rounded-xl bg-[#fff8eb] p-4 text-sm text-[#615a4f]">The official portal does not permit its documents to be displayed inside other websites. Open the source document in a new tab to review the complete notification.</p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold">
              {guidelineUrl && <a className="underline" href={guidelineUrl} rel="noreferrer" target="_blank">Open official scheme guidelines</a>}
              {scholarship.officialFaqUrl && <a className="underline" href={scholarship.officialFaqUrl} rel="noreferrer" target="_blank">Open official FAQ</a>}
              {scholarship.sourceListingUrl && <a className="underline" href={scholarship.sourceListingUrl} rel="noreferrer" target="_blank">View official portal listing</a>}
            </div>
          </section>
        </div>
        <aside className="h-fit rounded-2xl border-2 border-[#171717] bg-[#fff8eb] p-5 lg:sticky lg:top-5">
          <ShieldCheck size={28} />
          <h2 className="mt-3 text-lg font-black">Check eligibility</h2>
          <p className="mt-2 text-sm text-[#615a4f]">Official verification status: <strong>{scholarship.verificationStatus}</strong>. Eligibility shown here is estimated until the official rules are checked.</p>
          <p className="mt-2 text-xs text-[#615a4f]">“Application status unconfirmed” means the application window is not verified; it does not mean you are ineligible.</p>
          {eligibility && (
            <section className={`mt-4 rounded-2xl border-2 p-4 text-sm ${
              eligibility.result === "ELIGIBLE"
                ? "border-emerald-700 bg-emerald-50"
                : eligibility.result === "NOT_ELIGIBLE"
                  ? "border-rose-700 bg-rose-50"
                  : "border-amber-600 bg-amber-50"
            }`} role="status">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-black">
                  {eligibility.result === "ELIGIBLE"
                    ? "Congratulations! You are eligible for this scholarship."
                    : eligibility.result === "NOT_ELIGIBLE"
                      ? "You are currently not eligible for this scholarship."
                      : "Verification Required"}
                </h3>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black">
                  {eligibility.result.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-1 font-bold">{scholarship.title}</p>
              {eligibility.criteriaAvailable === false && (
                <p className="mt-3">{eligibility.criteriaMessage}</p>
              )}
              {eligibility.reasons?.length > 0 && (
                <div className="mt-3">
                  <p className="font-black">Why this result</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {eligibility.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </div>
              )}
              {eligibility.verificationRequired?.length > 0 && (
                <div className="mt-3">
                  <p className="font-black">Needs official verification</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {eligibility.verificationRequired.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </div>
              )}
              {eligibility.criteria?.length > 0 && (
                <div className="mt-4">
                  <p className="font-black">Eligibility conditions</p>
                  <ul className="mt-2 space-y-2">
                    {eligibility.criteria.map((criterion, index) => (
                      <li className="flex gap-2" key={`${criterion.field}-${index}`}>
                        <span className="font-black" aria-hidden="true">
                          {criterion.status === "MET" ? "✓" : criterion.status === "NOT_MET" ? "✕" : "!"}
                        </span>
                        <span>
                          <strong>{criterion.status.replaceAll("_", " ")}:</strong> {criterion.requirement}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 rounded-xl bg-white/80 p-3">
                <p className="font-black">Estimated scholarship benefit</p>
                <p className="mt-1">{typeof scholarship.amount === "number"
                  ? `₹${scholarship.amount.toLocaleString("en-IN")}`
                  : scholarship.amount?.display || scholarship.benefits?.join(" · ") || "Refer to the official notification."}</p>
              </div>
              {eligibility.evaluatedAt && (
                <p className="mt-3 text-xs">Checked {new Date(eligibility.evaluatedAt).toLocaleString("en-IN")}. This is an estimate, not an official award decision.</p>
              )}
            </section>
          )}
          {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
          {eligibility?.result === "ELIGIBLE" && !canContinueToApply && (
            <p className="mt-3 text-xs text-[#615a4f]">
              {scholarship.open
                ? "You may meet the listed criteria, but an official application link is not available here."
                : "You may meet the listed criteria, but applications are not verified open yet. Check the official source for current dates."}
            </p>
          )}
          {canContinueToApply ? (
            <button className="mt-4 w-full rounded-xl border-2 border-[#171717] bg-[#c8ef16] px-4 py-3 font-black" disabled={working} onClick={continueToApply} type="button">{working ? "Opening…" : "Visit Official Application Website"}</button>
          ) : (
            <button className="mt-4 w-full rounded-xl border-2 border-[#171717] bg-[#ffd943] px-4 py-3 font-black" disabled={authLoading || working} onClick={checkEligibility} type="button">{working ? "Checking…" : user ? eligibility ? "Check Again" : "Check Eligibility" : "Sign in to Check Eligibility"}</button>
          )}
          <a className="mt-3 flex items-center justify-center gap-2 text-sm font-bold underline" href={scholarship.officialSourceUrl} rel="noreferrer" target="_blank">Official eligibility source<ExternalLink size={14} /></a>
          {scholarship.officialApplicationUrl && <a className="mt-2 block text-center text-xs text-[#615a4f] underline" href={scholarship.officialApplicationUrl} rel="noreferrer" target="_blank">Official application portal</a>}
        </aside>
      </div>
    </main>
  );
}

