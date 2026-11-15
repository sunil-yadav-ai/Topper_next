"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import {
  subscribeResourceOptionsUpdated,
} from "../lib/resource-options.js";
import useResponsiveFilters from "../lib/useResponsiveFilters.js";
import { usePageMotion } from "../lib/usePageMotion.js";
import AdUnit from "../components/AdUnit.jsx";
import { EmptyState, PageLoader } from "../components/PageState.jsx";

const pageSize = 12;
const noteMarksOptions = ["2", "3", "4", "5", "6", "8", "10", "12", "15", "20"];
const emptyNoteFilters = { subject: "", topic: "", university: "", marks: "" };
const emptyPyqFilters = { q: "", subject: "", university: "", examinationYear: "" };

function errorText(error) {
  return error.response?.data?.message ?? error.message ?? "Search failed.";
}

function SelectField({
  label,
  name,
  onChange,
  options,
  value,
  placeholder,
  disabled = false,
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      <select
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
        name={name}
        onChange={onChange}
        disabled={disabled}
        value={value}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function TextField({ label, name, onChange, value, ...props }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
        name={name}
        onChange={onChange}
        value={value}
        {...props}
      />
    </label>
  );
}

function NotePreviewBackground({ src }) {
  const [failed, setFailed] = useState(!src);

  return (
    <>
      {src && !failed ? (
        <img
          alt=""
          className="resource-card__preview"
          width="400"
          height="550"
          loading="lazy"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          src={`${api.defaults.baseURL}${src}`}
        />
      ) : (
        <div aria-hidden="true" className="resource-card__fallback">
          <div className="flex flex-col items-center gap-2">
            <FileText size={54} strokeWidth={1.2} />
            <span className="text-xs font-semibold tracking-wide">PREVIEW UNAVAILABLE</span>
          </div>
        </div>
      )}
    </>
  );
}

export default function ResourceSearchPage() {
  const { user } = useAuth();
  const rootRef = useRef(null);
  const [activeTab, setActiveTab] = useState("note");
  const [filtersOpen, setFiltersOpen] = useResponsiveFilters();
  const [noteDraft, setNoteDraft] = useState(emptyNoteFilters);
  const [pyqDraft, setPyqDraft] = useState(emptyPyqFilters);
  const [appliedFilters, setAppliedFilters] = useState({
    note: emptyNoteFilters,
    pyq: emptyPyqFilters,
  });
  const [options, setOptions] = useState({
    note: { subjects: [], topics: [], universities: [], years: [] },
    pyq: { subjects: [], topics: [], universities: [], years: [] },
  });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [searchRefresh, setSearchRefresh] = useState(0);
  const [resources, setResources] = useState([]);
  const [pagination, setPagination] = useState({ pages: 0, total: 0 });
  const [page, setPage] = useState(1);
  const [suggestions, setSuggestions] = useState([]);
  const [focusedTopic, setFocusedTopic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voting, setVoting] = useState("");
  const [helpfulVotes, setHelpfulVotes] = useState(() => new Set());
  const [bookmarkingId, setBookmarkingId] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const [reportForm, setReportForm] = useState({
    pageNumber: "1",
    category: "incorrect_definition",
    explanation: "",
    suggestedCorrection: "",
  });
  const [submittingReport, setSubmittingReport] = useState(false);

  const activeFilters = appliedFilters[activeTab];
  const searchParams = useMemo(
    () => ({
      ...activeFilters,
      resourceType: activeTab,
      page,
      limit: pageSize,
    }),
    [activeFilters, activeTab, page],
  );
  const topicPrefix = noteDraft.topic.trim();

  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      setOptionsError("");
      try {
        const [notesResponse, pyqsResponse] = await Promise.all([
          api.get("/search/options", { params: { resourceType: "note" } }),
          api.get("/search/options", { params: { resourceType: "pyq" } }),
        ]);
        if (!active) return;
        setOptions({
          note: notesResponse.data.options,
          pyq: pyqsResponse.data.options,
        });
      } catch (requestError) {
        if (active) setOptionsError(errorText(requestError));
      } finally {
        if (active) setOptionsLoading(false);
      }
    };
    void loadOptions();
    const refreshSearch = () => setSearchRefresh((current) => current + 1);
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadOptions();
      refreshSearch();
    };
    const unsubscribe = subscribeResourceOptionsUpdated(() => {
      void loadOptions();
      refreshSearch();
    });
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      api
        .get("/search", { params: searchParams, signal: controller.signal })
        .then(({ data }) => {
          setResources(data.resources);
          setPagination(data.pagination);
        })
        .catch((requestError) => {
          if (requestError.name !== "CanceledError") setError(errorText(requestError));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchParams, searchRefresh]);

  useEffect(() => {
    if (activeTab !== "note" || topicPrefix.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .get("/search/suggestions", {
          params: { q: topicPrefix, resourceType: "note", field: "topic" },
          signal: controller.signal,
        })
        .then(({ data }) => setSuggestions(data.suggestions))
        .catch((requestError) => {
          if (requestError.name !== "CanceledError") setError(errorText(requestError));
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeTab, topicPrefix]);

  usePageMotion(rootRef, { dependencies: [activeTab, loading, resources.length] });

  function updateDraft(event) {
    const { name, value } = event.target;
    if (activeTab === "note") {
      setNoteDraft((current) => ({ ...current, [name]: value }));
    } else {
      setPyqDraft((current) => ({ ...current, [name]: value }));
    }
  }

  function applyFilters(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setPage(1);
    setAppliedFilters((current) => ({
      ...current,
      [activeTab]: activeTab === "note" ? noteDraft : pyqDraft,
    }));
  }

  function clearFilters() {
    const emptyFilters = activeTab === "note" ? emptyNoteFilters : emptyPyqFilters;
    if (activeTab === "note") setNoteDraft(emptyNoteFilters);
    else setPyqDraft(emptyPyqFilters);
    setAppliedFilters((current) => ({ ...current, [activeTab]: emptyFilters }));
    setPage(1);
    setSuggestions([]);
    setError("");
  }

  function chooseTab(tab) {
    setActiveTab(tab);
    setPage(1);
    setSuggestions([]);
    setError("");
    setNotice("");
  }

  function selectTopic(value) {
    setNoteDraft((current) => ({ ...current, topic: value }));
    setSuggestions([]);
    setFocusedTopic(false);
  }

  async function voteHelpful(resource) {
    setVoting(resource.id);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post(`/search/${resource.type}/${resource.id}/helpful`);
      setResources((current) =>
        current.map((item) =>
          item.id === resource.id && item.type === resource.type
            ? { ...item, helpfulCount: data.helpfulCount }
            : item,
        ),
      );
      setHelpfulVotes((current) => new Set(current).add(`${resource.type}:${resource.id}`));
      setNotice(data.message);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setVoting("");
    }
  }

  async function toggleBookmark(resource) {
    setBookmarkingId(resource.id);
    setError("");
    setNotice("");
    try {
      if (resource.isBookmarked) {
        await api.delete(`/library/bookmarks/${resource.type}/${resource.id}`);
      } else {
        await api.post("/library/bookmarks", {
          resourceType: resource.type,
          resourceId: resource.id,
        });
      }
      setResources((current) =>
        current.map((item) =>
          item.id === resource.id && item.type === resource.type
            ? { ...item, isBookmarked: !resource.isBookmarked }
            : item,
        ),
      );
      setNotice(
        resource.isBookmarked
          ? "Resource removed from your library."
          : "Resource saved to your library.",
      );
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBookmarkingId("");
    }
  }

  async function submitMistakeReport(event) {
    event.preventDefault();
    if (!reportTarget) return;
    setSubmittingReport(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post(`/notes/${reportTarget.id}/reports`, reportForm);
      setNotice(data.message);
      setReportTarget(null);
      setReportForm({
        pageNumber: "1",
        category: "incorrect_definition",
        explanation: "",
        suggestedCorrection: "",
      });
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSubmittingReport(false);
    }
  }

  return (
    <main className="ed-resource-search-page ed-explore-page min-h-screen bg-slate-50" ref={rootRef}>
      <section className="mx-auto  max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="ed-explore-hero   mb-6 rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-white to-orange-50 px-5 py-7 shadow-sm sm:mb-8 sm:px-8 sm:py-9" data-motion-intro>
          <p className="text-xs  font-bold uppercase tracking-[0.16em] text-brand sm:text-sm">The Topper resource library</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Find your next study resource</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Explore student notes and previous-year question papers. AI verification results are shown separately from publication.
          </p>
          <svg aria-hidden="true" className="ed-explore-hero-art" viewBox="0 0 180 150" fill="none">
            <circle className="ed-explore-hero-orbit" cx="91" cy="76" r="57" />
            <g className="ed-explore-hero-float">
              <path d="M47 48.5c13-6 26-5 39 2v53c-13-7-26-8-39-2v-53Z" />
              <path d="M133 48.5c-13-6-26-5-39 2v53c13-7 26-8 39-2v-53Z" />
              <path d="M90 51v55" />
              <path d="M57 61c7-2 14-1 20 2M57 72c7-2 14-1 20 2M123 61c-7-2-14-1-20 2M123 72c-7-2-14-1-20 2" />
            </g>
            <path className="ed-explore-hero-spark" d="m137 24 3.5 9.5L150 37l-9.5 3.5L137 50l-3.5-9.5L124 37l9.5-3.5L137 24Z" />
            <circle className="ed-explore-hero-dot" cx="42" cy="105" r="5" />
          </svg>
        </header>

        <div className="ed-explore-tabs mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-orange-100 bg-white p-2 shadow-sm" role="tablist" aria-label="Resource search type" data-motion-intro>
          <button
            aria-selected={activeTab === "note"}
            className={`ed-explore-tab flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition sm:text-base ${activeTab === "note" ? "is-active bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-orange-50 hover:text-ink"}`}
            onClick={() => chooseTab("note")}
            role="tab"
            type="button"
          >
            <BookOpen aria-hidden="true" size={18} />
            Find Notes
          </button>
          <button
            aria-selected={activeTab === "pyq"}
            className={`ed-explore-tab flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition sm:text-base ${activeTab === "pyq" ? "is-active bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-orange-50 hover:text-ink"}`}
            onClick={() => chooseTab("pyq")}
            role="tab"
            type="button"
          >
            <ClipboardList aria-hidden="true" className="shrink-0" size={18} />
            Find Question Papers
          </button>
        </div>

        <details
          className="ed-responsive-filter-disclosure mb-6"
          onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          open={filtersOpen}
        >
          <summary className="ed-responsive-filter-summary">
            <SlidersHorizontal aria-hidden="true" size={17} />
            <span>{filtersOpen ? "Hide filters" : "Show filters"}</span>
          </summary>
          <form className="ed-explore-filters rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" onSubmit={applyFilters} role="tabpanel" data-motion-intro>
          <div className="mb-4 flex items-center gap-2">
            {activeTab === "note" ? (
              <BookOpen aria-hidden="true" className="text-brand" size={20} />
            ) : (
              <ClipboardList aria-hidden="true" className="text-brand" size={20} />
            )}
            <h2 className="text-lg font-bold text-ink">
              {activeTab === "note" ? "Notes search" : "Question paper search"}
            </h2>
          </div>

          {optionsError && (
            <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              Could not load search filters: {optionsError}
            </p>
          )}

          {activeTab === "note" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                label="Subject"
                name="subject"
                onChange={updateDraft}
                options={options.note.subjects}
                placeholder={
                  optionsLoading
                    ? "Loading subjects…"
                    : options.note.subjects.length
                      ? "All subjects"
                      : "No subjects available"
                }
                disabled={optionsLoading || options.note.subjects.length === 0}
                value={noteDraft.subject}
              />
              <div className="relative">
                <TextField
                  autoComplete="off"
                  label="Topic"
                  name="topic"
                  onBlur={() => window.setTimeout(() => setFocusedTopic(false), 120)}
                  onChange={updateDraft}
                  onFocus={() => setFocusedTopic(true)}
                  placeholder="Search a topic"
                  value={noteDraft.topic}
                />
                {focusedTopic && suggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg" role="listbox">
                    {suggestions.map((suggestion) => (
                      <li key={suggestion}>
                        <button
                          className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-orange-50"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectTopic(suggestion)}
                          role="option"
                          type="button"
                        >
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <SelectField
                label="University"
                name="university"
                onChange={updateDraft}
                options={options.note.universities}
                placeholder={
                  optionsLoading
                    ? "Loading universities…"
                    : options.note.universities.length
                      ? "All universities"
                      : "No universities available"
                }
                disabled={optionsLoading || options.note.universities.length === 0}
                value={noteDraft.university}
              />
              <SelectField
                label="Marks"
                name="marks"
                onChange={updateDraft}
                options={noteMarksOptions}
                placeholder="All Marks"
                value={noteDraft.marks}
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField
                label="Search question papers"
                name="q"
                onChange={updateDraft}
                placeholder="Subject, course, or keyword"
                value={pyqDraft.q}
              />
              <SelectField
                label="Subject"
                name="subject"
                onChange={updateDraft}
                options={options.pyq.subjects}
                placeholder={
                  optionsLoading
                    ? "Loading subjects…"
                    : options.pyq.subjects.length
                      ? "All subjects"
                      : "No subjects available"
                }
                disabled={optionsLoading || options.pyq.subjects.length === 0}
                value={pyqDraft.subject}
              />
              <SelectField
                label="University"
                name="university"
                onChange={updateDraft}
                options={options.pyq.universities}
                placeholder={
                  optionsLoading
                    ? "Loading universities…"
                    : options.pyq.universities.length
                      ? "All universities"
                      : "No universities available"
                }
                disabled={optionsLoading || options.pyq.universities.length === 0}
                value={pyqDraft.university}
              />
              <SelectField
                label="Batch / examination year"
                name="examinationYear"
                onChange={updateDraft}
                options={options.pyq.years.map(String)}
                placeholder={
                  optionsLoading
                    ? "Loading years…"
                    : options.pyq.years.length
                      ? "All years"
                      : "No years available"
                }
                disabled={optionsLoading || options.pyq.years.length === 0}
                value={pyqDraft.examinationYear}
              />
            </div>
          )}

          {activeTab === "pyq" &&
            !optionsLoading &&
            options.pyq.subjects.length === 0 && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                No question papers are available yet. Papers appear here as soon as they are uploaded.
              </p>
            )}

          <div className="ed-explore-filter-actions mt-5 flex flex-wrap items-center gap-3">
            <button className="ed-explore-search-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60" disabled={optionsLoading} type="submit">
              <Search aria-hidden="true" size={17} />
              Search
            </button>
            <button className="ed-explore-clear-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50" onClick={clearFilters} type="button">
              <RotateCcw aria-hidden="true" size={16} />
              Clear filters
            </button>
            {optionsLoading && <span className="text-xs text-slate-500">Loading available filters…</span>}
            <span className="text-xs text-slate-500">
              Filters update from uploads. OCR and AI verification status never hide a published resource.
            </span>
          </div>
          </form>
        </details>

        <section className="ed-explore-results" aria-label={activeTab === "note" ? "Notes search results" : "Question paper search results"}>
          <AdUnit className="mb-5" placement="search" />
          <div className="ed-explore-results-bar mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3" data-motion-scroll>
            <p className="text-sm text-slate-600">
              <strong>{pagination.total}</strong> {activeTab === "note" ? "public note" : "public question paper"}{pagination.total === 1 ? "" : "s"}
            </p>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              {activeTab === "note" ? "Public notes" : "Public question papers"}
            </span>
          </div>
          {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}
          {notice && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{notice}</p>}
          {loading ? (
            <PageLoader label={activeTab === "note" ? "Searching notes…" : "Searching question papers…"} />
          ) : resources.length === 0 ? (
            <EmptyState icon="book" illustration={activeTab === "note" ? "search" : "book"} title={activeTab === "note" ? "No notes found" : "No question papers found"}>
              {Object.values(activeFilters).some(Boolean)
                ? "No searchable resources match these filters. Try different filters or clear your search."
                : activeTab === "note"
                  ? "Notes appear here as soon as students upload them. OCR and AI verification continue separately in the background."
                  : "Question papers appear here as soon as students upload them."}
            </EmptyState>
          ) : (
            <div className="ed-explore-resource-grid grid gap-5 md:grid-cols-2">
              {resources.map((resource) => {
                const hasVoted = helpfulVotes.has(`${resource.type}:${resource.id}`);
                return (
                  <article className={`ed-explore-resource-card resource-card group relative flex min-w-0 flex-col overflow-hidden rounded-[1.65rem] border border-orange-100 shadow-[0_12px_30px_rgba(23,23,23,0.08)] transition duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_20px_40px_rgba(23,23,23,0.15)] ${resource.type === "note" ? "resource-card--note" : "bg-[#fff9ec]"}`} key={`${resource.type}-${resource.id}`} data-motion-stagger>
                    {resource.type === "note" && (
                      <NotePreviewBackground src={resource.previewPath} />
                    )}
                    <div className={`ed-explore-card-content relative z-10 flex min-h-full flex-col p-4 sm:p-5 ${resource.type === "note" ? "min-h-[550px]" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      {resource.uploader?.username ? (
                        <Link
                          className="ed-explore-badge rounded-lg border border-orange-200/80 bg-white/80 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-brand shadow-sm backdrop-blur-md hover:underline"
                          href={`/profile/${encodeURIComponent(resource.uploader.username)}`}
                        >
                          {resource.uploader.fullName || "Uploader unavailable"}
                        </Link>
                      ) : (
                        <span className="ed-explore-badge rounded-lg border border-orange-200/80 bg-white/80 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-brand shadow-sm backdrop-blur-md">
                          {resource.uploader?.fullName || "Uploader unavailable"}
                        </span>
                      )}
                      <span className="ed-explore-format rounded-lg border border-white/80 bg-white/75 px-2.5 py-1 text-xs font-bold uppercase text-slate-600 shadow-sm backdrop-blur-md">{resource.fileFormat?.toUpperCase()}</span>
                    </div>
                    <h3 className="ed-explore-card-title mt-4 break-words text-lg font-bold text-ink">{resource.title}</h3>
                    <p className="ed-explore-card-description mt-1 line-clamp-2 break-words text-sm leading-relaxed text-slate-700">{resource.description}</p>
                    <dl className="ed-explore-card-details mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-white/70 bg-white/55 p-3 text-sm shadow-sm backdrop-blur-md">
                      <div><dt className="text-xs font-medium text-slate-500">Subject</dt><dd className="break-words font-semibold text-slate-800">{resource.subject}</dd></div>
                      {resource.type === "note" ? (
                        <>
                          {resource.topic && <div><dt className="text-xs font-medium text-slate-500">Topic</dt><dd className="break-words font-semibold text-slate-800">{resource.topic}</dd></div>}
                          {resource.unit && <div><dt className="text-xs font-medium text-slate-500">Unit</dt><dd className="break-words font-semibold text-slate-800">{resource.unit}</dd></div>}
                          <div><dt className="text-xs font-medium text-slate-500">Marks</dt><dd className="font-semibold text-slate-800">{resource.marks ?? "—"}</dd></div>
                          <div><dt className="text-xs font-medium text-slate-500">Semester</dt><dd className="font-semibold text-slate-800">{resource.semester}</dd></div>
                          <div><dt className="text-xs font-medium text-slate-500">University</dt><dd className="break-words font-semibold text-slate-800">{resource.university || "—"}</dd></div>
                          <div><dt className="text-xs font-medium text-slate-500">Department</dt><dd className="break-words font-semibold text-slate-800">{resource.department || "—"}</dd></div>
                        </>
                      ) : (
                        <>
                          <div><dt className="text-xs font-medium text-slate-500">University</dt><dd className="font-semibold text-slate-800">{resource.university}</dd></div>
                          <div><dt className="text-xs font-medium text-slate-500">Year</dt><dd className="font-semibold text-slate-800">{resource.examinationYear}</dd></div>
                          <div><dt className="text-xs font-medium text-slate-500">Paper</dt><dd className="font-semibold text-slate-800">{resource.examType} · Sem {resource.semester}</dd></div>
                        </>
                      )}
                    </dl>
                    {resource.type === "pyq" && (
                      <p className="mt-2 text-xs text-slate-500">
                        {[resource.department, resource.college].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="mt-2 text-xs font-medium text-slate-600">{new Date(resource.createdAt).toLocaleDateString()} · {resource.helpfulCount} found helpful</p>
                    <div className="ed-explore-card-actions mt-auto flex flex-wrap items-center gap-2 pt-5">
                      {user ? (
                        <Link className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-3 py-2.5 text-center text-sm font-bold text-slate-700 shadow-sm transition hover:bg-orange-50" href={`/resources/${resource.type}/${resource.id}`}>
                          <FileText aria-hidden="true" size={16} />
                          Open resource
                        </Link>
                      ) : (
                        <Link className="flex-1 rounded-xl bg-brand px-3 py-2.5 text-center text-sm font-bold text-white shadow-sm transition hover:bg-orange-700" href="/login">
                          Sign in to open
                        </Link>
                      )}
                      {user?.role === "user" && (
                        <button
                          className="rounded-xl border border-slate-200 bg-white/85 px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                          disabled={voting === resource.id || hasVoted}
                          onClick={() => voteHelpful(resource)}
                          type="button"
                        >
                          {voting === resource.id ? "Saving…" : hasVoted ? "Marked helpful" : "Helpful"}
                        </button>
                      )}
                      {user?.role === "user" && (
                        <button
                          className="rounded-xl border border-orange-200 bg-white/85 px-3 py-2.5 text-xs font-semibold text-brand shadow-sm transition hover:bg-orange-50 disabled:opacity-50"
                          disabled={bookmarkingId === resource.id}
                          onClick={() => toggleBookmark(resource)}
                          type="button"
                        >
                          {bookmarkingId === resource.id ? "Saving…" : resource.isBookmarked ? "Saved" : "Save"}
                        </button>
                      )}
                      {resource.type === "note" && user?.role === "user" && (
                        <button
                          className="rounded-xl border border-rose-200 bg-white/85 px-3 py-2.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50"
                          onClick={() => {
                            setReportTarget(resource);
                            setReportForm((current) => ({ ...current, pageNumber: "1" }));
                          }}
                          type="button"
                        >
                          Report Mistake
                        </button>
                      )}
                    </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {pagination.pages > 1 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} type="button">
                <ChevronLeft aria-hidden="true" size={16} /> Previous
              </button>
              <span className="text-sm text-slate-600">Page {page} of {pagination.pages}</span>
              <button className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40" disabled={page >= pagination.pages || loading} onClick={() => setPage((current) => current + 1)} type="button">
                Next <ChevronRight aria-hidden="true" size={16} />
              </button>
            </div>
          )}
        </section>
      </section>

      {reportTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-3 sm:p-4">
          <form className="my-auto w-full max-w-xl rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl sm:p-6" onSubmit={submitMistakeReport}>
            <h2 className="text-xl font-bold text-ink">Report a mistake</h2>
            <p className="mt-1 text-sm text-slate-600">{reportTarget.title}</p>
            <label className="mt-5 block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Page number</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                max={reportTarget.pageCount || 10000}
                min="1"
                onChange={(event) => setReportForm((current) => ({ ...current, pageNumber: event.target.value }))}
                required
                type="number"
                value={reportForm.pageNumber}
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Issue category</span>
              <select className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm" onChange={(event) => setReportForm((current) => ({ ...current, category: event.target.value }))} value={reportForm.category}>
                <option value="incorrect_definition">Incorrect definition</option>
                <option value="wrong_formula">Wrong formula</option>
                <option value="incorrect_calculation">Incorrect calculation</option>
                <option value="missing_explanation">Missing explanation</option>
                <option value="poor_readability">Poor handwriting readability</option>
                <option value="duplicate_content">Duplicate content</option>
              </select>
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Explain the issue</span>
              <textarea className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" maxLength={2000} onChange={(event) => setReportForm((current) => ({ ...current, explanation: event.target.value }))} required rows={3} value={reportForm.explanation} />
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Suggested correction (optional)</span>
              <textarea className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm" maxLength={2000} onChange={(event) => setReportForm((current) => ({ ...current, suggestedCorrection: event.target.value }))} rows={3} value={reportForm.suggestedCorrection} />
            </label>
            <p className="mt-3 text-xs text-slate-500">A report requests a review. It does not change the note or contributor points unless an administrator confirms an issue.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setReportTarget(null)} type="button">Cancel</button>
              <button className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={submittingReport} type="submit">
                {submittingReport ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
