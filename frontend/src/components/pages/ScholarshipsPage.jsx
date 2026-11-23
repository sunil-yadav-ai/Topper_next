"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Search, SlidersHorizontal, Bookmark } from "lucide-react";
import { api } from "../../lib/api.js";

const categories = [
  ["central-government", "Central Government Scholarships"],
  ["state-government", "State Government Scholarships"],
  ["private", "Private Scholarships"],
  ["merit", "Merit-Based Scholarships"],
  ["need-based", "Need-Based Scholarships"],
  ["minority", "Minority Scholarships"],
  ["sc-st-obc", "SC/ST/OBC Scholarships"],
  ["girls", "Girls Education Scholarships"],
  ["college-university", "College and University Scholarships"],
  ["international", "International Scholarships"],
  ["research", "Research Fellowships"],
  ["technical", "Technical Education Scholarships"],
];

function errorMessage(error) {
  return error.response?.data?.message ?? error.message ?? "Could not load scholarships.";
}

export default function ScholarshipsPage() {
  const [scholarships, setScholarships] = useState([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sources, setSources] = useState([]);
  const [sourcesError, setSourcesError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [sort, setSort] = useState("deadline");

  const load = useCallback(async (page = 1, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/scholarships", {
        params: { search: appliedSearch, category, status, sort, page, limit: 12 },
      });
      setScholarships(data.scholarships);
      setPagination(data.pagination);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [appliedSearch, category, sort, status]);

  const loadSources = useCallback(async () => {
    try {
      const { data } = await api.get("/scholarships/sources");
      setSources(data.sources ?? []);
      setSourcesError("");
    } catch (requestError) {
      setSourcesError(errorMessage(requestError));
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    void loadSources();
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load(pagination.page, { silent: true });
      void loadSources();
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [load, loadSources, pagination.page]);

  function submit(event) {
    event.preventDefault();
    if (search === appliedSearch) void load(1);
    else setAppliedSearch(search);
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
      <section className="overflow-hidden rounded-3xl border-2 border-[#171717] bg-[#fff8eb] px-5 py-8 shadow-[6px_6px_0_#171717] sm:px-10 sm:py-12">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9270e8]">Topper scholarship desk</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black sm:text-6xl">Find Scholarships That Match Your Dreams</h1>
        <p className="mt-4 max-w-2xl text-base text-[#615a4f] sm:text-lg">Discover government and private scholarships designed to support your education.</p>
        <form className="mt-7 flex max-w-3xl flex-col gap-3 sm:flex-row" onSubmit={submit}>
          <label className="relative flex-1">
            <span className="sr-only">Search scholarships</span>
            <Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2" size={19} />
            <input className="h-12 w-full rounded-xl border-2 border-[#171717] bg-white pl-12 pr-4" placeholder="Scholarship name or organization" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <button className="h-12 rounded-xl border-2 border-[#171717] bg-[#c8ef16] px-6 font-black shadow-[3px_3px_0_#171717]" type="submit">Search</button>
        </form>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Scholarship categories">
        {categories.map(([slug, label]) => (
          <button key={slug} className={`rounded-xl border border-[#171717]/20 bg-white px-4 py-4 text-left text-sm font-bold ${category === slug ? "ring-2 ring-[#9270e8]" : ""}`} onClick={() => { setCategory(category === slug ? "" : slug); }} type="button">{label}</button>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-[#171717]/15 bg-white p-4">
        <details>
          <summary className="cursor-pointer font-black">Scholarship source collection status · automatic source checks every 6 hours</summary>
          {sourcesError ? <p className="mt-3 text-sm text-rose-700" role="alert">{sourcesError}</p> : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sources.map((source) => {
                const status = source.lastSuccessfulAt
                  ? source.monitoringStatus
                  : source.enabled ? "awaiting_first_sync" : source.monitoringStatus;
                const statusLabel = {
                  active: "Sync successful",
                  partial: "Partial sync",
                  unavailable: "Unavailable",
                  restricted: "Restricted",
                  not_integrated: "Not integrated",
                  disabled: "Disabled",
                  awaiting_first_sync: "Awaiting first sync",
                }[status] ?? status;
                return (
                  <article className="rounded-xl border border-[#171717]/10 bg-[#fff8eb] p-3" key={source.id}>
                    <div className="flex items-start justify-between gap-2">
                      <a className="font-bold underline" href={source.url} rel="noreferrer" target="_blank">{source.name}</a>
                      <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black">{statusLabel}</span>
                    </div>
                    <p className="mt-2 text-xs text-[#615a4f]">
                      {source.recordCount} verified record{source.recordCount === 1 ? "" : "s"} · {source.openCount} with verified open status
                    </p>
                    <p className="mt-1 text-[11px] text-[#615a4f]">
                      Last run: +{source.lastDiscovered} new · {source.lastUpdated} updated · {source.lastDeduplicated} deduplicated
                    </p>
                    <p className="mt-1 text-[11px] text-[#615a4f]">
                      Last successful sync: {source.lastSuccessfulAt ? new Date(source.lastSuccessfulAt).toLocaleString("en-IN") : "Never"}
                    </p>
                    {(source.lastError || source.limitation) && (
                      <p className="mt-2 text-xs text-[#615a4f]">{source.lastError || source.limitation}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </details>
      </section>

      <section className="mt-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#615a4f]">Discover opportunities</p>
            <h2 className="mt-1 text-2xl font-black">{pagination.total} verified scholarship listing{pagination.total === 1 ? "" : "s"}</h2>
            <p className="mt-1 text-xs text-[#615a4f]">Official sources are scanned every 6 hours; this page checks for new listings every 5 minutes.</p>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-[#171717]/20 bg-white px-3 py-2 text-sm font-bold"><SlidersHorizontal size={16} />Status
            <select className="rounded-lg border-0 bg-transparent" value={status} onChange={(event) => { setStatus(event.target.value); }}>
              <option value="">All</option><option value="open">Open</option><option value="closed">Closed</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-[#171717]/20 bg-white px-3 py-2 text-sm font-bold">Sort
            <select className="rounded-lg border-0 bg-transparent" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="deadline">Deadline Approaching</option>
              <option value="newest">Recently Added</option>
              <option value="amount">Highest Scholarship Amount</option>
              <option value="alphabetical">Alphabetical Order</option>
            </select>
          </label>
        </div>
        {error && <p className="rounded-xl bg-rose-50 p-4 text-rose-700" role="alert">{error}</p>}
        {loading ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[1,2,3].map((key) => <div key={key} className="h-72 animate-pulse rounded-2xl border border-[#171717]/10 bg-white" />)}</div> : scholarships.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[#171717]/20 p-10 text-center"><h3 className="font-black">No scholarships found</h3><p className="mt-2 text-sm text-[#615a4f]">Try another search or clear the selected filters.</p></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scholarships.map((scholarship) => (
              <article className="flex min-h-72 flex-col rounded-2xl border-2 border-[#171717] bg-white p-5 shadow-[4px_4px_0_#171717]" key={scholarship.id}>
                <div className="flex items-start justify-between gap-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${scholarship.open ? "bg-[#c8ef16]" : "bg-slate-200 text-slate-600"}`}>{scholarship.open ? "OPEN" : scholarship.applicationStatus === "closed" ? "CLOSED" : "CHECK OFFICIAL WEBSITE"}</span><Bookmark aria-hidden="true" size={18} /></div>
                <h3 className="mt-4 text-xl font-black">{scholarship.title}</h3>
                <p className="mt-1 text-sm font-bold text-[#9270e8]">{scholarship.organization}</p>
                <p className="mt-3 line-clamp-3 text-sm text-[#615a4f]">{scholarship.description || "View details for eligibility, benefits and application information."}</p>
                {scholarship.academicYear && <p className="mt-3 text-xs font-bold text-[#615a4f]">Academic year: {scholarship.academicYear}</p>}
                <span className="mt-3 w-fit rounded-full bg-[#f2ecff] px-2.5 py-1 text-[11px] font-bold">Official source: {scholarship.sourceName || "Official Portal"}</span>
                <div className="mt-auto pt-5">
                  <p className="font-black">{typeof scholarship.amount === "number" ? `₹${scholarship.amount.toLocaleString("en-IN")}` : scholarship.amount?.display || "Refer to Official Notification"}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[#615a4f]"><CalendarDays size={14} />Deadline: {scholarship.applicationDeadline ? new Date(scholarship.applicationDeadline).toLocaleDateString("en-IN") : "Check Official Website"}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link className="rounded-xl border-2 border-[#171717] bg-[#ffd943] px-3 py-2.5 text-center text-sm font-black" href={`/scholarships/${scholarship.slug}`}>View Details</Link>
                    {scholarship.open && scholarship.officialApplicationUrl ? (
                      <Link className="rounded-xl border-2 border-[#171717] bg-[#c8ef16] px-3 py-2.5 text-center text-sm font-black" href={`/scholarships/${scholarship.slug}`}>Apply Now</Link>
                    ) : (
                      <span className="rounded-xl border-2 border-[#171717]/30 px-3 py-2.5 text-center text-sm font-bold text-[#615a4f]">{scholarship.applicationStatus === "closed" ? "Applications Closed" : "Check Website"}</span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {pagination.pages > 1 && <div className="mt-7 flex justify-center gap-2">{[...Array(pagination.pages)].slice(0, 10).map((_, index) => <button className={`size-10 rounded-lg border border-[#171717] ${pagination.page === index + 1 ? "bg-[#171717] text-white" : "bg-white"}`} key={index} onClick={() => load(index + 1)} type="button">{index + 1}</button>)}</div>}
      </section>
    </main>
  );
}
