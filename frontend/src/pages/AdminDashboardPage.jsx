"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CommunityReports from "../components/dashboard/CommunityReports.jsx";
import AdminRewardsPanel from "../components/AdminRewardsPanel.jsx";
import Panel from "../components/Panel.jsx";
import { api } from "../lib/api.js";
import { usePageMotion } from "../lib/usePageMotion.js";

const sections = [
  ["overview", "Overview"],
  ["content", "AI reports"],
  ["students", "Students"],
  ["reports", "Resource reports"],
  ["rewards", "Rewards"],
  ["announcements", "Announcements"],
];

const metricCards = [
  ["totalStudents", "Registered students", "blue"],
  ["totalNotes", "Uploaded notes", "indigo"],
  ["totalPyqs", "Uploaded PYQs", "violet"],
  ["pendingAiVerification", "Pending AI verification", "amber"],
  ["rejectedNotes", "Rejected notes", "red"],
  ["needsHumanReview", "Needs human review", "orange"],
  ["reportedResources", "Open resource reports", "rose"],
  ["activeStudents", "Not suspended accounts", "green"],
];

function messageFrom(error) {
  return error.response?.data?.message ?? error.message ?? "Admin dashboard request failed.";
}

export default function AdminDashboardPage() {
  const rootRef = useRef(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadOverview() {
    setError("");
    try {
      const { data } = await api.get("/admin/overview");
      setOverview(data);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  usePageMotion(rootRef, { dependencies: [activeSection, loading, overview] });

  return (
    <main className="min-h-screen bg-slate-50" ref={rootRef}>
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-ink via-[#253372] to-indigo-700 px-5 py-7 text-white shadow-[0_24px_70px_-35px_rgba(30,41,59,0.6)] sm:px-8 sm:py-9" data-motion-intro>
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border-[34px] border-white/[0.06]" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">Platform administration</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Admin dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100/85 sm:text-base">Manage students, AI verification reports, community reports, and the contributor reward budget.</p>
            </div>
            <button
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              onClick={loadOverview}
              type="button"
            >
              Refresh dashboard
            </button>
          </div>
        </div>

        {error && <p className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}</p>}

        {loading && !overview && (
          <Panel><p className="text-sm text-slate-600">Loading platform metrics…</p></Panel>
        )}
        {overview && activeSection === "overview" && (
          <section aria-label="Platform metrics" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metricCards.map(([key, title, tone]) => (
                <MetricCard data-motion-stagger key={key} title={title} tone={tone} value={overview.metrics[key]} />
              ))}
          </section>
        )}

        <nav aria-label="Admin dashboard sections" className="my-6 flex snap-x gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" data-motion-intro>
          {sections.map(([key, label]) => (
            <button
              aria-current={activeSection === key ? "page" : undefined}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold ${
                activeSection === key
                  ? "bg-brand text-white shadow-sm shadow-indigo-950/15"
                  : "text-slate-600 hover:bg-slate-50 hover:text-ink"
              }`}
              key={key}
              onClick={() => setActiveSection(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        {activeSection === "overview" && (
          overview ? (
            <>
              <OverviewSection
                analytics={overview.monthlyAnalytics}
                rewardBudget={overview.rewardBudget}
              />
            </>
          ) : !loading && (
            <Panel><p className="text-sm text-slate-600">Platform metrics could not be loaded.</p></Panel>
          )
        )}
        {activeSection === "content" && <ContentModerationSection />}
        {activeSection === "students" && <StudentManagementSection />}
        {activeSection === "reports" && <ResourceReportsSection />}
        {activeSection === "rewards" && <AdminRewardsPanel />}
        {activeSection === "announcements" && <AdminAnnouncementsSection />}
      </section>
    </main>
  );
}

function MetricCard({ title, value, tone, ...props }) {
  const tones = {
    blue: "bg-sky-50 text-sky-700 ring-sky-100",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    amber: "bg-amber-50 text-amber-800 ring-amber-100",
    red: "bg-rose-50 text-rose-700 ring-rose-100",
    orange: "bg-orange-50 text-orange-800 ring-orange-100",
    rose: "bg-pink-50 text-pink-700 ring-pink-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  };
  return (
    <Panel className="p-4 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.4)] transition hover:-translate-y-0.5 hover:shadow-md sm:p-5" {...props}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`mt-3 inline-flex min-w-14 items-center justify-center rounded-xl px-3 py-1.5 text-2xl font-extrabold ring-1 ring-inset ${tones[tone]}`} data-motion-count>
        {value}
      </p>
    </Panel>
  );
}

function OverviewSection({ analytics, rewardBudget }) {
  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">Monthly platform analytics</h2>
            <p className="mt-1 text-sm text-slate-600">UTC calendar months, covering the past 12 months.</p>
          </div>
          <span className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-brand">
            {analytics.reduce((total, item) => total + item.notesUploaded + item.pyqsUploaded, 0)} uploads in period
          </span>
        </div>
        <MonthlyAnalytics analytics={analytics} />
        <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-slate-600">
          <LegendItem color="bg-indigo-500" label="Notes" />
          <LegendItem color="bg-sky-500" label="PYQs" />
          <LegendItem color="bg-violet-500" label="New students" />
          <LegendItem color="bg-rose-500" label="Resource reports" />
          <LegendItem color="bg-emerald-500" label="Contributions recognized" />
        </div>
      </Panel>

      <Panel>
        <h2 className="text-lg font-bold text-ink">Reward budget snapshot</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Initial allocation", rewardBudget.initialPoints],
            ["Available", rewardBudget.availablePoints],
            ["Distributed", rewardBudget.distributedPoints],
            ["Returned after admin deductions", rewardBudget.reclaimedPoints],
          ].map(([label, amount]) => (
            <div className="rounded-xl bg-slate-50 p-4" key={label}>
              <p className="text-xs font-semibold text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-extrabold text-ink">{amount}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function LegendItem({ color, label }) {
  return <span className="inline-flex items-center gap-2"><span className={`size-2.5 rounded-sm ${color}`} />{label}</span>;
}

function MonthlyAnalytics({ analytics }) {
  const fields = [
    ["notesUploaded", "bg-indigo-500"],
    ["pyqsUploaded", "bg-sky-500"],
    ["newStudents", "bg-violet-500"],
    ["reportedResources", "bg-rose-500"],
    ["verifiedContributions", "bg-emerald-500"],
  ];
  const maximum = Math.max(1, ...analytics.flatMap((item) => fields.map(([field]) => item[field])));
  return (
    <div className="mt-7 grid grid-cols-6 gap-2 sm:grid-cols-12 sm:gap-3" role="img" aria-label="Monthly chart for notes, PYQs, new students, reports, and contributions">
      {analytics.map((month) => (
        <div className="min-w-0" key={month.month}>
          <div className="flex h-44 items-end justify-center gap-0.5 border-b border-slate-200 px-0.5 sm:gap-1">
            {fields.map(([field, color]) => (
              <div
                className={`w-full max-w-3 rounded-t ${color}`}
                key={field}
                style={{ height: `${month[field] ? Math.max(5, (month[field] / maximum) * 100) : 0}%` }}
                title={`${month.month}: ${field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)} ${month[field]}`}
              />
            ))}
          </div>
          <p className="mt-2 truncate text-center text-[10px] font-medium text-slate-500 sm:text-xs">
            {new Date(`${month.month}-01T00:00:00.000Z`).toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" })}
          </p>
        </div>
      ))}
    </div>
  );
}

function ContentModerationSection() {
  return <AdminNotesQueue />;
}

function AdminNotesQueue() {
  const [decision, setDecision] = useState("needs_review");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function loadNotes() {
    setError("");
    try {
      const { data } = await api.get("/admin/notes", { params: { decision, page } });
      setResult(data);
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  useEffect(() => {
    loadNotes();
  }, [decision, page]);

  return (
    <section className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">AI verification reports</h2>
            <p className="mt-1 text-sm text-slate-600">
              Read-only AI verification reports. Uploads are public regardless of verification status.
            </p>
          </div>
          <label className="text-sm font-semibold text-slate-700">
            AI result
            <select
              className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
              onChange={(event) => {
                setDecision(event.target.value);
                setPage(1);
              }}
              value={decision}
            >
              <option value="needs_review">Needs human review</option>
              <option value="all">All notes</option>
              <option value="rejected">AI rejected</option>
              <option value="approved">AI approved</option>
            </select>
          </label>
        </div>
      </Panel>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
      {!result ? (
        <Panel><p className="text-sm text-slate-600">Loading note reports…</p></Panel>
      ) : result.notes.length ? (
        <div className="space-y-4">
          {result.notes.map((note) => (
            <NoteReviewCard key={note.id} note={note} />
          ))}
          <Pagination pagination={result.pagination} onPage={setPage} />
        </div>
      ) : (
        <Panel><p className="text-sm text-slate-600">No notes match this verification filter.</p></Panel>
      )}
    </section>
  );
}

function NoteReviewCard({ note }) {
  const issues = note.verificationReport?.report?.issues ?? [];
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-ink">{note.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{note.subject} · {note.unit} · {note.topic} · Semester {note.semester}</p>
          <p className="mt-1 text-xs text-slate-500">
            Uploaded by {note.uploader} ({note.uploaderEmail}) · {new Date(note.uploadedAt).toLocaleString()}
          </p>
        </div>
        <Link
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-brand hover:bg-indigo-50"
          href={`/resources/note/${note.id}`}
        >
          View resource
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <StatusBadge>{note.decision}</StatusBadge>
        <StatusBadge>{note.verificationStatus} verification</StatusBadge>
        <StatusBadge>{note.decisionSource === "admin" ? "Historical admin override" : "AI result"}</StatusBadge>
        <StatusBadge>{note.publicationStatus}</StatusBadge>
        <StatusBadge>{note.confirmedErrorCount} confirmed / {note.verifiableStatementCount} verifiable</StatusBadge>
        {note.mistakePercentage != null && <StatusBadge>{note.mistakePercentage}% mistake rate</StatusBadge>}
      </div>
      {note.humanReviewReason && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{note.humanReviewReason}</p>}
      {!note.verificationReport && note.verificationStatus === "completed" && (
        <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          The encrypted verification report is unavailable. The verification result remains unchanged.
        </p>
      )}
      {note.verificationReport && (
        <details className="mt-4 rounded-xl border border-slate-200 p-4">
          <summary className="cursor-pointer font-semibold text-ink">
            AI verification report · {note.verificationReport.referenceCount} references · {issues.length} findings
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-slate-500">
              Model {note.verificationReport.model} · Verified {new Date(note.verificationReport.verifiedAt).toLocaleString()}
            </p>
            {issues.map((issue, index) => (
              <article className="rounded-lg bg-slate-50 p-3" key={`${issue.pageNumber}-${index}`}>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="text-slate-600">Page {issue.pageNumber}</span>
                  <span className="capitalize text-brand">{issue.classification?.replaceAll("_", " ")}</span>
                  <span className="capitalize text-slate-500">{issue.errorCategory?.replaceAll("_", " ")}</span>
                  <span className="text-slate-500">{Math.round((issue.confidence ?? 0) * 100)}% confidence</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">{issue.originalStatement}</p>
                <p className="mt-1 text-sm text-slate-700">{issue.issueDescription}</p>
                {issue.suggestedCorrection && (
                  <p className="mt-2 rounded-md bg-indigo-50 p-2 text-sm text-indigo-900"><strong>Suggested correction:</strong> {issue.suggestedCorrection}</p>
                )}
                {issue.verificationEvidence && <p className="mt-2 text-xs text-slate-600"><strong>Evidence:</strong> {issue.verificationEvidence}</p>}
                {issue.references?.map((reference) => (
                  <a className="mt-1 block break-all text-xs text-brand underline" href={reference.url} key={reference.url} rel="noreferrer" target="_blank">
                    {reference.title || reference.url}
                  </a>
                ))}
              </article>
            ))}
            {!issues.length && <p className="text-sm text-slate-600">The report contains no specific findings.</p>}
            {note.verificationReport.report.analysisLimitations?.map((limitation, index) => (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" key={index}>{limitation}</p>
            ))}
          </div>
        </details>
      )}
      {note.ocrPages?.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">OCR text ({note.ocrPages.length} pages)</summary>
          <div className="mt-2 space-y-2">
            {note.ocrPages.map((page) => (
              <div className="rounded-lg bg-slate-50 p-3" key={page.pageNumber}>
                <h4 className="text-xs font-bold text-slate-600">Page {page.pageNumber} · {page.readabilityStatus}</h4>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{page.extractedText}</pre>
              </div>
            ))}
          </div>
        </details>
      )}
    </Panel>
  );
}

function StatusBadge({ children }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{children}</span>;
}

function StudentManagementSection() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [reasons, setReasons] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadStudents(nextPage = page) {
    setError("");
    try {
      const { data } = await api.get("/admin/students", {
        params: { q: query.trim(), page: nextPage },
      });
      setResult(data);
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  useEffect(() => { loadStudents(); }, [page]);

  async function updateSuspension(student) {
    const reason = reasons[student.id]?.trim();
    if (!reason) {
      setError("Enter a reason for suspending or reinstating the account.");
      return;
    }
    setBusyId(student.id);
    setError("");
    setNotice("");
    try {
      const { data } = await api.patch(`/admin/students/${student.id}/suspension`, {
        suspended: !student.isSuspended,
        reason,
      });
      setNotice(data.message);
      setReasons((current) => ({ ...current, [student.id]: "" }));
      await loadStudents(page);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusyId("");
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    loadStudents(1);
  }

  return (
    <section className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink">Student management</h2>
            <p className="mt-1 text-sm text-slate-600">View academic contributions and suspend or reinstate accounts for policy violations.</p>
          </div>
          <form className="flex w-full gap-2 sm:w-auto" onSubmit={submitSearch}>
            <input
              aria-label="Search students"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-72"
              maxLength={120}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, email, university"
              value={query}
            />
            <button className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white" type="submit">Search</button>
          </form>
        </div>
      </Panel>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
      {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
      {!result ? <Panel><p className="text-sm text-slate-600">Loading student accounts…</p></Panel> : result.students.length ? (
        <div className="space-y-3">
          {result.students.map((student) => (
            <Panel key={student.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">{student.fullName}</h3>
                  <p className="mt-0.5 text-sm text-slate-600">{student.email} · {student.emailVerified ? "Email verified" : "Email not verified"}</p>
                  <p className="mt-1 text-xs text-slate-500">{student.university} · {student.department} · Batch {student.batch} · Semester {student.semester}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${student.isSuspended ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {student.isSuspended ? "Suspended" : "Active"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <StatusBadge>{student.uploadedNotes} notes</StatusBadge>
                <StatusBadge>{student.uploadedPyqs} PYQs</StatusBadge>
                <StatusBadge>{student.rewardPoints} reward points</StatusBadge>
                <StatusBadge>Joined {new Date(student.createdAt).toLocaleDateString()}</StatusBadge>
              </div>
              {student.isSuspended && (
                <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
                  Suspension reason: {student.suspensionReason} {student.suspendedBy && `· Actioned by ${student.suspendedBy}`}
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label={`Reason to ${student.isSuspended ? "reinstate" : "suspend"} ${student.fullName}`}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  maxLength={500}
                  onChange={(event) => setReasons((current) => ({ ...current, [student.id]: event.target.value }))}
                  placeholder="Required policy reason"
                  value={reasons[student.id] ?? ""}
                />
                <button
                  className={`rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50 ${student.isSuspended ? "bg-emerald-600 text-white" : "border border-rose-200 text-rose-700"}`}
                  disabled={Boolean(busyId)}
                  onClick={() => updateSuspension(student)}
                  type="button"
                >
                  {busyId === student.id ? "Saving…" : student.isSuspended ? "Reinstate account" : "Suspend account"}
                </button>
              </div>
            </Panel>
          ))}
          <Pagination pagination={result.pagination} onPage={setPage} />
        </div>
      ) : <Panel><p className="text-sm text-slate-600">No student accounts matched this search.</p></Panel>}
    </section>
  );
}

function ResourceReportsSection() {
  const [activeQueue, setActiveQueue] = useState("notes");
  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap gap-2">
          <button className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeQueue === "notes" ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`} onClick={() => setActiveQueue("notes")} type="button">Note corrections</button>
          <button className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeQueue === "pyqs" ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`} onClick={() => setActiveQueue("pyqs")} type="button">PYQ reports</button>
        </div>
      </Panel>
      {activeQueue === "notes" ? <CommunityReports admin /> : <AdminPyqReports />}
    </div>
  );
}

function AdminPyqReports() {
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [reviewNotes, setReviewNotes] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadReports() {
    setError("");
    try {
      const { data } = await api.get("/admin/pyq-reports", { params: { page } });
      setResult(data);
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  useEffect(() => { loadReports(); }, [page]);

  async function reviewReport(report, decision) {
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      const { data } = await api.patch(`/admin/pyq-reports/${report.id}`, {
        decision,
        reviewNote: reviewNotes[report.id] ?? "",
      });
      setNotice(data.message);
      await loadReports();
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusyId("");
    }
  }

  return (
    <Panel>
      <h2 className="text-xl font-bold text-ink">Reported question papers</h2>
      <p className="mt-1 text-sm text-slate-600">Review incorrect or duplicate paper reports; reviewing a report does not automatically change contributor points.</p>
      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
      {notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
      {!result ? <p className="mt-4 text-sm text-slate-600">Loading reports…</p> : result.reports.length ? (
        <div className="mt-4 space-y-3">
          {result.reports.map((report) => (
            <article className="rounded-xl border border-slate-200 p-4" key={report.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">{report.pyq?.subject ?? "Deleted question paper"}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {report.pyq && `${report.pyq.university} · ${report.pyq.college} · Semester ${report.pyq.semester} · ${report.pyq.examinationYear} ${report.pyq.examType}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Reported by {report.reportedBy} ({report.reportedByEmail}) · {new Date(report.createdAt).toLocaleString()}</p>
                </div>
                <StatusBadge>{report.status}</StatusBadge>
              </div>
              <p className="mt-3 text-sm font-semibold capitalize text-slate-700">{report.reason}</p>
              {report.details && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{report.details}</p>}
              {report.pyq?.id && <Link className="mt-2 inline-block text-sm font-semibold text-brand underline" href={`/resources/pyq/${report.pyq.id}`}>View question paper</Link>}
              {report.status === "open" && (
                <>
                  <textarea
                    className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    maxLength={1000}
                    onChange={(event) => setReviewNotes((current) => ({ ...current, [report.id]: event.target.value }))}
                    placeholder="Optional review note"
                    rows={2}
                    value={reviewNotes[report.id] ?? ""}
                  />
                  <div className="mt-2 flex gap-2">
                    <button className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={Boolean(busyId)} onClick={() => reviewReport(report, "reviewed")} type="button">Mark reviewed</button>
                    <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50" disabled={Boolean(busyId)} onClick={() => reviewReport(report, "dismissed")} type="button">Dismiss</button>
                  </div>
                </>
              )}
              {report.reviewNote && <p className="mt-2 text-sm text-slate-600">Admin note: {report.reviewNote}</p>}
            </article>
          ))}
          <Pagination pagination={result.pagination} onPage={setPage} />
        </div>
      ) : <p className="mt-4 text-sm text-slate-600">No open question paper reports.</p>}
    </Panel>
  );
}

function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.pages < 2) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-3">
      <button
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        disabled={pagination.page <= 1}
        onClick={() => onPage(pagination.page - 1)}
        type="button"
      >
        Previous
      </button>
      <span className="text-sm text-slate-500">Page {pagination.page} of {pagination.pages} · {pagination.total} records</span>
      <button
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        disabled={pagination.page >= pagination.pages}
        onClick={() => onPage(pagination.page + 1)}
        type="button"
      >
        Next
      </button>
    </div>
  );
}

function AdminAnnouncementsSection() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function sendAnnouncement(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/admin/announcements", { title, message });
      setNotice(data.message);
      setTitle("");
      setMessage("");
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <h2 className="text-xl font-bold text-ink">Send student announcement</h2>
      <p className="mt-1 text-sm text-slate-600">
        This creates an in-app notification for every active student account.
      </p>
      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
      {notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
      <form className="mt-5 space-y-4" onSubmit={sendAnnouncement}>
        <label className="block text-sm font-semibold text-slate-700">
          Title
          <input
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Announcement
          <textarea
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"
            maxLength={2000}
            onChange={(event) => setMessage(event.target.value)}
            required
            rows={5}
            value={message}
          />
        </label>
        <button className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={busy} type="submit">
          {busy ? "Sending…" : "Send announcement"}
        </button>
      </form>
    </Panel>
  );
}
