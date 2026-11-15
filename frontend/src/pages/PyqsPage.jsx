"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { notifyResourceOptionsUpdated } from "../lib/resource-options.js";
import AdUnit from "../components/AdUnit.jsx";
import { PageLoader } from "../components/PageState.jsx";
import { usePageMotion } from "../lib/usePageMotion.js";
import useResponsiveFilters from "../lib/useResponsiveFilters.js";
import { JsonLd, breadcrumbSchema, organizationSchema } from "../lib/seo-schema.jsx";
import { getPublicResourcePath } from "../lib/navigation.js";

const initialFilters = {
  search: "",
  semester: "",
  subject: "",
  examinationYear: "",
};
const emptyUpload = {
  title: "",
  description: "",
  university: "",
  college: "",
  department: "",
  course: "",
  semester: "",
  subject: "",
  examinationYear: "",
  examType: "Final",
};
const pageSize = 12;

function messageFromError(error) {
  return error.response?.data?.message ?? error.message ?? "Something went wrong.";
}

function formatSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Field({ label, name, onChange, required = false, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        name={name}
        onChange={onChange}
        required={required}
        {...props}
      />
    </label>
  );
}

export default function PyqsPage({ siteOrigin }) {
  const { user } = useAuth();
  const rootRef = useRef(null);
  const [filtersOpen, setFiltersOpen] = useResponsiveFilters();
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [pyqs, setPyqs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bookmarksOnly, setBookmarksOnly] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFields, setUploadFields] = useState(() => ({
    ...emptyUpload,
    university: user?.university ?? "",
    college: user?.college ?? "",
    department: user?.department ?? "",
    semester: user?.semester ? String(user.semester) : "",
  }));
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [reporting, setReporting] = useState(null);
  const [reportReason, setReportReason] = useState("incorrect");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const structuredData = useMemo(() => [
    ...organizationSchema(siteOrigin).slice(0, 1),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Previous-year question papers", path: "/pyqs" },
    ], siteOrigin),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Previous-Year Question Papers | Topper",
      description: "Browse published previous-year question papers by subject, semester, university and examination year on Topper.",
      url: new URL("/pyqs", siteOrigin).href,
      ...(pyqs.length ? {
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: pyqs.length,
          itemListElement: pyqs.map((pyq, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: pyq.title,
            url: new URL(getPublicResourcePath({ ...pyq, type: "pyq" }), siteOrigin).href,
          })),
        },
      } : {}),
    },
  ], [pyqs, siteOrigin]);

  const loadPyqs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = bookmarksOnly
        ? await api.get("/pyqs/bookmarks")
        : await api.get("/pyqs", {
            params: { ...appliedFilters, page, limit: pageSize },
          });
      setPyqs(data.pyqs);
      setPagination(
        data.pagination ?? { page: 1, pages: 1, total: data.pyqs.length },
      );
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, bookmarksOnly, page, refreshKey]);

  useEffect(() => {
    loadPyqs();
  }, [loadPyqs]);

  useEffect(() => {
    setUploadFields((current) => ({
      ...current,
      university: current.university || user?.university || "",
      college: current.college || user?.college || "",
      department: current.department || user?.department || "",
      semester: current.semester || (user?.semester ? String(user.semester) : ""),
    }));
  }, [user]);

  usePageMotion(rootRef, { dependencies: [loading, pyqs.length, page, showUpload] });

  function applyFilters(event) {
    event.preventDefault();
    setAppliedFilters(filters);
    setPage(1);
    setBookmarksOnly(false);
  }

  function updateUploadField(event) {
    setUploadFields((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!uploadFile) {
      setError("Choose a question paper PDF to upload.");
      return;
    }
    const extension = uploadFile.name.split(".").pop()?.toLowerCase();
    const supportedTypes = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
    };
    if (!supportedTypes[extension] || uploadFile.type !== supportedTypes[extension]) {
      setError("Choose a valid PDF, JPG, JPEG, or PNG question paper.");
      return;
    }
    if (uploadFile.size > 20 * 1024 * 1024) {
      setError("Question paper files must be 20 MB or smaller.");
      return;
    }

    const formData = new FormData();
    Object.entries(uploadFields).forEach(([name, value]) => formData.append(name, value));
    formData.append("file", uploadFile);
    setUploading(true);
    setUploadProgress(0);
    try {
      const { data } = await api.post("/pyqs", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
        onUploadProgress(progressEvent) {
          if (progressEvent.total) {
            setUploadProgress(
              Math.round((progressEvent.loaded * 100) / progressEvent.total),
            );
          }
        },
      });
      setNotice(data.message);
      notifyResourceOptionsUpdated();
      setUploadFile(null);
      setUploadFields((current) => ({
        ...emptyUpload,
        university: current.university,
        college: current.college,
        department: current.department,
        semester: current.semester,
      }));
      setShowUpload(false);
      setBookmarksOnly(false);
      setAppliedFilters(initialFilters);
      setFilters(initialFilters);
      setPage(1);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function toggleBookmark(pyq) {
    if (!user || user.role !== "user") {
      setError("Sign in with a student account to bookmark papers.");
      return;
    }
    setError("");
    try {
      if (pyq.isBookmarked) {
        await api.delete(`/pyqs/${pyq.id}/bookmark`);
      } else {
        await api.post(`/pyqs/${pyq.id}/bookmark`);
      }
      if (bookmarksOnly && pyq.isBookmarked) {
        setPyqs((current) => current.filter((item) => item.id !== pyq.id));
      } else {
        setPyqs((current) =>
          current.map((item) =>
            item.id === pyq.id
              ? { ...item, isBookmarked: !item.isBookmarked }
              : item,
          ),
        );
      }
    } catch (requestError) {
      setError(messageFromError(requestError));
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!reporting) return;
    setError("");
    setSubmittingReport(true);
    try {
      const { data } = await api.post(`/pyqs/${reporting.id}/reports`, {
        reason: reportReason,
        details: reportDetails,
      });
      setNotice(data.message);
      setReporting(null);
      setReportDetails("");
      setReportReason("incorrect");
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setSubmittingReport(false);
    }
  }

  return (
    <main className="ed-pyqs-page min-h-screen bg-slate-50" ref={rootRef}>
      <JsonLd data={structuredData} />
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="ed-pyq-hero relative mb-6 flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-white to-indigo-50 px-5 py-7 shadow-sm sm:mb-8 sm:px-8 sm:py-9" data-motion-intro>
          <div className="ed-pyq-hero-copy min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand sm:text-sm">
              Free student resources
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Previous year question papers
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Find, view, and share past papers. Every paper is free to view.
            </p>
          </div>
          <p className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 sm:text-sm">
            Always free · No paywall
          </p>
          <svg aria-hidden="true" className="ed-pyq-hero-art" fill="none" viewBox="0 0 120 120">
            <path d="M24 23h39l21 21v53H24z" fill="#fff9ec" stroke="currentColor" strokeLinejoin="round" strokeWidth="3" />
            <path d="M63 23v22h21M37 60h34M37 69h34M37 78h25" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
            <path d="m93 22 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="#ff6b24" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
            <path d="m22 82 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#c8ea24" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
        </div>

        {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}
        {notice && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{notice}</p>}

        {showUpload && user?.role === "user" && (
          <form
            className="mb-7 rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm sm:p-7"
            data-motion-scroll
            onSubmit={handleUpload}
          >
            <div className="mb-5">
              <h2 className="text-xl font-bold text-ink">Share a question paper</h2>
              <p className="mt-1 text-sm text-slate-500">PDF, JPG, JPEG, or PNG · maximum 20 MB · free for everyone.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Title" name="title" maxLength={200} onChange={updateUploadField} required value={uploadFields.title} />
              <Field label="University" name="university" maxLength={160} onChange={updateUploadField} required value={uploadFields.university} />
              <Field label="College" name="college" maxLength={160} onChange={updateUploadField} required value={uploadFields.college} />
              <Field label="Department" name="department" maxLength={120} onChange={updateUploadField} required value={uploadFields.department} />
              <Field label="Course" name="course" maxLength={120} onChange={updateUploadField} required value={uploadFields.course} />
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Semester</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  name="semester"
                  onChange={updateUploadField}
                  required
                  value={uploadFields.semester}
                >
                  <option value="">Select semester</option>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((semester) => (
                    <option key={semester} value={semester}>{semester}</option>
                  ))}
                </select>
              </label>
              <Field label="Subject" name="subject" maxLength={160} onChange={updateUploadField} required value={uploadFields.subject} />
              <Field label="Examination year" name="examinationYear" type="number" min="1900" max={new Date().getFullYear() + 1} onChange={updateUploadField} required value={uploadFields.examinationYear} />
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Exam type</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  name="examType"
                  onChange={updateUploadField}
                  required
                  value={uploadFields.examType}
                >
                  {["Midterm", "Final", "Supplementary", "Quiz", "Other"].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Description</span>
              <textarea
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                maxLength={2000}
                name="description"
                onChange={updateUploadField}
                required
                rows={3}
                value={uploadFields.description}
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Question paper (PDF or image)</span>
              <input
                accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                className="block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-brand"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                required
                type="file"
              />
            </label>
            {uploading && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span>Uploading paper…</span><span>{uploadProgress}%</span>
                </div>
                <progress aria-label="PYQ upload progress" className="h-2 w-full accent-indigo-600" max="100" value={uploadProgress} />
              </div>
            )}
            <button
              className="mt-5 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
              disabled={uploading}
              type="submit"
            >
              {uploading ? "Uploading…" : "Upload free question paper"}
            </button>
          </form>
        )}

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-6">
          <aside className="ed-pyq-filter h-fit min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" data-motion-scroll>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold text-ink">Find a paper</h2>
              {user?.role === "user" && (
                <button
                  className="text-xs font-semibold text-brand hover:underline"
                  onClick={() => {
                    setBookmarksOnly((current) => !current);
                    setPage(1);
                  }}
                  type="button"
                >
                  {bookmarksOnly ? "Browse all" : "Bookmarks"}
                </button>
              )}
            </div>
            <details
              className="ed-responsive-filter-disclosure"
              onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
              open={filtersOpen}
            >
              <summary className="ed-responsive-filter-summary">
                <span>{filtersOpen ? "Hide filters" : "Show filters"}</span>
              </summary>
              <form className="space-y-4" onSubmit={applyFilters}>
              <Field
                label="Search"
                name="search"
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Subject, course, college…"
                value={filters.search}
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Semester</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  onChange={(event) => setFilters((current) => ({ ...current, semester: event.target.value }))}
                  value={filters.semester}
                >
                  <option value="">Any semester</option>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((semester) => (
                    <option key={semester} value={semester}>Semester {semester}</option>
                  ))}
                </select>
              </label>
              <Field
                label="Subject"
                name="subject"
                onChange={(event) => setFilters((current) => ({ ...current, subject: event.target.value }))}
                placeholder="e.g. Mathematics"
                value={filters.subject}
              />
              <Field
                label="Examination year"
                name="examinationYear"
                type="number"
                min="1900"
                max={new Date().getFullYear() + 1}
                onChange={(event) => setFilters((current) => ({ ...current, examinationYear: event.target.value }))}
                placeholder="e.g. 2025"
                value={filters.examinationYear}
              />
              <button className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700" type="submit">
                Apply filters
              </button>
              <button
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setFilters(initialFilters);
                  setAppliedFilters(initialFilters);
                  setPage(1);
                  setBookmarksOnly(false);
                }}
                type="button"
              >
                Clear filters
              </button>
              </form>
            </details>
          </aside>

          <section aria-label="Previous year question papers">
            <AdUnit className="mb-5" placement="pyqs" />
            <div className="ed-pyq-results-bar mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3" data-motion-scroll>
              <p className="text-sm text-slate-600">
                {bookmarksOnly ? `${pyqs.length} saved papers` : `${pagination.total} public papers`}
              </p>
              {!user && (
                <Link className="text-sm font-semibold text-brand hover:underline" href="/register">
                  Join to bookmark or report
                </Link>
              )}
            </div>
            {loading ? (
              <div className="ed-pyq-loading"><PageLoader label="Loading papers…" /></div>
            ) : pyqs.length === 0 ? (
              <div className="ed-pyq-empty rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" data-motion-scroll>
                <svg aria-hidden="true" className="mx-auto mb-4 size-10 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.75h7l4 4v12.5H7a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 3.75v4h4M8.5 12h7M8.5 15.5h7" />
                </svg>
                <h2 className="font-bold text-ink">No papers found</h2>
                <p className="mt-2 text-sm text-slate-500">Try other search terms or filters. Every paper shared here is free.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pyqs.map((pyq) => (
                  <article className="ed-pyq-card flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md sm:p-5" data-motion-stagger key={pyq.id}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold uppercase text-rose-700">{pyq.fileFormat?.toUpperCase()} · Public</span>
                      <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-brand">
                        Semester {pyq.semester}
                      </span>
                    </div>
                    <h2 className="mt-4 break-words text-lg font-bold text-ink">{pyq.subject}</h2>
                    <p className="mt-1 break-words text-sm text-slate-600">{pyq.course} · {pyq.department}</p>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs text-slate-500">Exam year</dt><dd className="font-semibold text-slate-800">{pyq.examinationYear}</dd></div>
                      <div><dt className="text-xs text-slate-500">Exam type</dt><dd className="font-semibold text-slate-800">{pyq.examType}</dd></div>
                    </dl>
                    <p className="mt-3 line-clamp-2 text-xs text-slate-500">{pyq.college} · {pyq.university}</p>
                    {pyq.uploadedByUsername && (
                      <Link className="mt-2 w-fit text-xs font-semibold text-brand hover:underline" href={`/profile/${encodeURIComponent(pyq.uploadedByUsername)}`}>
                        Shared by {pyq.uploadedBy}
                      </Link>
                    )}
                    <p className="mt-2 text-xs text-slate-400">{formatSize(pyq.fileSize)} · Shared by students</p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                      <Link
                        className="inline-flex flex-1 items-center justify-center rounded-xl bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                        href={getPublicResourcePath({ ...pyq, type: "pyq" })}
                      >
                        View Resource
                      </Link>
                      {user?.role === "user" && (
                        <button
                          aria-label={pyq.isBookmarked ? "Remove bookmark" : "Bookmark paper"}
                          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => toggleBookmark(pyq)}
                          type="button"
                        >
                          {pyq.isBookmarked ? "★ Saved" : "☆ Save"}
                        </button>
                      )}
                      {user?.role === "user" && (
                        <button
                          className="w-full pt-1 text-left text-xs font-medium text-slate-500 hover:text-rose-700"
                          onClick={() => setReporting(pyq)}
                          type="button"
                        >
                          Report incorrect or duplicate
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!bookmarksOnly && pagination.pages > 1 && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => current - 1)}
                  type="button"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600">Page {page} of {pagination.pages}</span>
                <button
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
                  disabled={page >= pagination.pages || loading}
                  onClick={() => setPage((current) => current + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </div>
      </section>

      {reporting && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-3 sm:p-4">
          <form
            className="my-auto w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl sm:p-6"
            onSubmit={submitReport}
          >
            <h2 className="text-xl font-bold text-ink">Report question paper</h2>
            <p className="mt-1 text-sm text-slate-600">{reporting.subject} · {reporting.examinationYear}</p>
            <label className="mt-5 block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Reason</span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                onChange={(event) => setReportReason(event.target.value)}
                value={reportReason}
              >
                <option value="incorrect">Paper or details are incorrect</option>
                <option value="duplicate">Duplicate paper</option>
                <option value="other">Other issue</option>
              </select>
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Details (optional)</span>
              <textarea
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                maxLength={1000}
                onChange={(event) => setReportDetails(event.target.value)}
                rows={3}
                value={reportDetails}
              />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                onClick={() => setReporting(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={submittingReport}
                type="submit"
              >
                {submittingReport ? "Sending…" : "Submit report"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
