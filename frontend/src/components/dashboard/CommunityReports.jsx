import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext.jsx";
import { api } from "../../lib/api.js";

const categoryLabels = {
  incorrect_definition: "Incorrect definition",
  wrong_formula: "Wrong formula",
  incorrect_calculation: "Incorrect calculation",
  missing_explanation: "Missing explanation",
  poor_readability: "Poor handwriting readability",
  duplicate_content: "Duplicate content",
};

function messageFromError(error) {
  return error.response?.data?.message ?? error.message ?? "Something went wrong.";
}

export default function CommunityReports({ admin = false }) {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [responses, setResponses] = useState({});
  const [reviewNotes, setReviewNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadReports() {
    setError("");
    try {
      const { data } = await api.get(
        admin ? "/notes/reports/review" : "/notes/reports",
      );
      setReports(data.reports);
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, [admin]);

  const visibleReports = reports;

  async function respond(report) {
    const responseText = responses[report.id]?.trim();
    if (!responseText) {
      setError("Enter a response before submitting.");
      return;
    }
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      await api.post(`/notes/reports/${report.id}/response`, {
        response: responseText,
      });
      setNotice("Response saved and the reporting student was notified.");
      setResponses((current) => ({ ...current, [report.id]: "" }));
      await loadReports();
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setBusyId("");
    }
  }

  async function review(report, decision) {
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      await api.patch(`/notes/reports/${report.id}/review`, {
        decision,
        reviewNote: reviewNotes[report.id] ?? "",
      });
      setNotice(
        decision === "confirmed"
          ? "Issue confirmed after review; no automatic point deduction was made."
          : "Report dismissed after review; no contributor points were changed.",
      );
      setReports((current) => current.filter((item) => item.id !== report.id));
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">
            {admin ? "Community reports to review" : "Reports about your notes"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Reports are reviewed before any action. Submitting a report never deducts contributor points.
          </p>
        </div>
        <button
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          onClick={loadReports}
          type="button"
        >
          Refresh
        </button>
      </div>
      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
      {notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{notice}</p>}
      {loading ? (
        <p className="mt-5 text-sm text-slate-600">Loading community reports…</p>
      ) : visibleReports.length === 0 ? (
        <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          {admin ? "No disputed community reports need review." : "No reports have been filed about your published notes."}
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {visibleReports.map((report) => (
            <article className="rounded-xl border border-slate-200 p-4" key={report.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-ink">{report.note?.title ?? "Published note"}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Page {report.pageNumber} · {categoryLabels[report.category] ?? report.category}
                    {report.reportedBy?.fullName ? ` · Reported by ${report.reportedBy.fullName}` : ""}
                  </p>
                </div>
                {admin && report.note?.id && (
                  <Link
                    className="mt-2 inline-block text-sm font-semibold text-brand hover:underline"
                    href={`/resources/note/${report.note.id}`}
                  >
                    View note
                  </Link>
                )}
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  report.status === "confirmed"
                    ? "bg-emerald-50 text-emerald-800"
                    : report.status === "dismissed"
                      ? "bg-slate-100 text-slate-600"
                      : "bg-amber-50 text-amber-800"
                }`}>
                  {report.status.replace("_", " ")}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{report.explanation}</p>
              {report.suggestedCorrection && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
                  <strong>Suggested correction:</strong> {report.suggestedCorrection}
                </p>
              )}
              {report.uploaderResponse && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <strong>Uploader response:</strong> {report.uploaderResponse}
                </p>
              )}
              {report.history?.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-brand">
                    Correction history ({report.history.length})
                  </summary>
                  <ol className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                    {report.history.map((entry, index) => (
                      <li className="text-xs text-slate-600" key={`${report.id}-${index}`}>
                        <strong>{entry.action.replaceAll("_", " ")}</strong>
                        {entry.message ? ` — ${entry.message}` : ""}
                        {entry.createdAt ? ` · ${new Date(entry.createdAt).toLocaleString()}` : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {!admin && report.status === "open" && report.note?.uploadedBy === user?.id && (
                <div className="mt-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Respond to the report</span>
                    <textarea
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      maxLength={2000}
                      onChange={(event) => setResponses((current) => ({ ...current, [report.id]: event.target.value }))}
                      rows={2}
                      value={responses[report.id] ?? ""}
                    />
                  </label>
                  <button
                    className="mt-2 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    disabled={busyId === report.id}
                    onClick={() => respond(report)}
                    type="button"
                  >
                    {busyId === report.id ? "Saving…" : "Send response"}
                  </button>
                </div>
              )}
              {admin && (
                <div className="mt-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Admin review note (optional)</span>
                    <textarea
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      maxLength={2000}
                      onChange={(event) => setReviewNotes((current) => ({ ...current, [report.id]: event.target.value }))}
                      rows={2}
                      value={reviewNotes[report.id] ?? ""}
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={busyId === report.id} onClick={() => review(report, "confirmed")} type="button">Confirm issue</button>
                    <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50" disabled={busyId === report.id} onClick={() => review(report, "dismissed")} type="button">Dismiss report</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
