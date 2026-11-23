"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api.js";

export default function MyScholarshipsPage({ embedded = false }) {
  const [tab, setTab] = useState("saved");
  const [saved, setSaved] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/scholarships/saved"), api.get("/scholarships/applications")])
      .then(([savedResponse, applicationResponse]) => {
        setSaved(savedResponse.data.scholarships);
        setApplications(applicationResponse.data.applications);
      })
      .catch((requestError) => setError(requestError.response?.data?.message ?? "Could not load your scholarships."))
      .finally(() => setLoading(false));
  }, []);

  async function updateApplication(application, patch) {
    try {
      await api.put(`/scholarships/applications/${application.id}`, patch);
      setApplications((current) => current.map((item) => item.id === application.id ? { ...item, ...patch } : item));
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Could not update application.");
    }
  }

  async function removeSaved(scholarship) {
    await api.post("/scholarships/save", { scholarshipId: scholarship.id });
    setSaved((current) => current.filter((item) => item.id !== scholarship.id));
  }

  return (
    <main className={embedded ? "w-full" : "mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-8 sm:py-12"}>
      {embedded ? null : (
        <>
          <h1 className="text-4xl font-black">My scholarships</h1>
          <p className="mt-2 text-[#615a4f]">Saved opportunities and your manual application tracking.</p>
        </>
      )}
      <div className="mt-7 flex gap-2 overflow-x-auto">
        {[["saved", "Saved"], ["applications", "Applications"], ["in_progress", "In progress"]].map(([key, label]) => (
          <button className={`rounded-xl border-2 border-[#171717] px-4 py-2.5 font-black ${tab === key ? "bg-[#c8ef16]" : "bg-white"}`} key={key} onClick={() => setTab(key)} type="button">{label}</button>
        ))}
      </div>
      {error && <p className="mt-5 rounded-xl bg-rose-50 p-4 text-rose-700" role="alert">{error}</p>}
      {loading ? <div className="mt-6 h-64 animate-pulse rounded-2xl bg-white" /> : tab === "saved" ? (
        saved.length ? <div className="mt-6 grid gap-4 md:grid-cols-2">{saved.map((item) => <article className="rounded-2xl border-2 border-[#171717] bg-white p-5" key={item.id}><h2 className="text-lg font-black">{item.title}</h2><p className="mt-1 text-sm text-[#9270e8]">{item.organization}</p><div className="mt-5 flex gap-2"><Link className="rounded-lg border border-[#171717] bg-[#ffd943] px-3 py-2 text-sm font-black" href={`/scholarships/${item.slug}`}>View</Link><button className="rounded-lg border border-[#171717] px-3 py-2 text-sm font-bold" onClick={() => removeSaved(item)} type="button">Remove</button></div></article>)}</div> : <p className="mt-6 rounded-2xl border border-dashed p-8 text-center">No saved scholarships yet.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {applications.filter((item) => tab !== "in_progress" || ["intended", "in_progress", "submitted"].includes(item.status)).length ? applications.filter((item) => tab !== "in_progress" || ["intended", "in_progress", "submitted"].includes(item.status)).map((item) => (
            <article className="rounded-2xl border-2 border-[#171717] bg-white p-5" key={item.id}>
              <h2 className="font-black">{item.scholarship?.title || "Scholarship"}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-bold">Application ID<input className="mt-1 w-full rounded-lg border px-3 py-2" defaultValue={item.applicationId} onBlur={(event) => updateApplication(item, { applicationId: event.target.value })} /></label>
                <label className="text-sm font-bold">Status<select className="mt-1 w-full rounded-lg border px-3 py-2" defaultValue={item.status} onChange={(event) => updateApplication(item, { status: event.target.value })}><option value="intended">Intended</option><option value="in_progress">In progress</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
                <label className="text-sm font-bold">Application date<input className="mt-1 w-full rounded-lg border px-3 py-2" type="date" defaultValue={item.applicationDate ? item.applicationDate.slice(0, 10) : ""} onBlur={(event) => updateApplication(item, { applicationDate: event.target.value })} /></label>
              </div>
              <p className="mt-3 text-xs text-[#615a4f]">Approved or rejected status is maintained manually. TOPPER does not claim official verification.</p>
            </article>
          )) : <p className="rounded-2xl border border-dashed p-8 text-center">No applications in this section.</p>}
        </div>
      )}
    </main>
  );
}
