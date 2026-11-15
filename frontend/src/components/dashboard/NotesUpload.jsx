import { useEffect, useState } from "react";
import Link from "next/link";
import FormField from "../FormField.jsx";
import { api } from "../../lib/api.js";
import { notifyResourceOptionsUpdated } from "../../lib/resource-options.js";

const maxFileSize = 10 * 1024 * 1024;
const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png"]);
const emptyForm = {
  title: "",
  description: "",
  department: "",
  batch: "",
  semester: "",
  subject: "",
  unit: "",
  topic: "",
};

function ocrStatusLabel(status) {
  if (status === "processing") return "Text recognition in progress";
  if (status === "completed") return "Text recognition complete";
  if (status === "failed") return "Text recognition failed";
  return "Text recognition queued";
}

function getErrorMessage(error) {
  return error.response?.data?.message ?? error.message ?? "Something went wrong.";
}

function formatFileSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function verificationLabel(status, publicationStatus) {
  if (status === "APPROVED") return "AI verification passed · public";
  if (status === "APPROVED_WITH_WARNING") return "AI verification passed with notes · public";
  if (status === "REJECTED") return "AI verification flagged possible errors · public";
  if (status === "NEEDS_HUMAN_REVIEW") return "AI recommends human review · public";
  if (status === "PENDING") return "Public · AI verification pending";
  if (publicationStatus === "published") return "Public resource";
  if (status === "completed") return "AI verification complete";
  if (status === "processing") return "AI verification in progress";
  if (status === "verified") return "AI verification completed";
  if (status === "rejected") return "AI verification flagged concerns";
  if (status === "failed") return "Verification needs attention";
  return "Queued for AI verification";
}

function NoteVerificationProgress({ note }) {
  const steps = ["Uploaded", "Text recognition", "AI academic review", "Decision"];
  const failed = ["failed", "rejected"].includes(note.verificationStatus);
  const activeStage =
    note.verificationStatus === "completed" ? 3 :
      note.verificationStatus === "processing" || note.ocrStatus === "completed" ? 2 :
        note.ocrStatus === "processing" ? 1 : 0;
  return (
    <ol aria-label="Note processing progress" className="mt-4 grid grid-cols-4 gap-1">
      {steps.map((step, index) => {
        const complete = index < activeStage || (index === 3 && note.verificationStatus === "completed");
        const current = index === activeStage && note.verificationStatus !== "completed";
        const color = failed && current
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : complete
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : current
              ? "border-indigo-200 bg-indigo-50 text-brand"
              : "border-slate-200 bg-white text-slate-400";
        return (
          <li aria-current={current ? "step" : undefined} className="min-w-0" key={step}>
            <div className={`flex min-h-11 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center sm:min-h-12 sm:flex-row sm:gap-1.5 sm:px-2 ${color}`}>
              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-current/10 text-[9px] font-extrabold">{complete ? "✓" : index + 1}</span>
              <span className="text-[9px] font-semibold leading-3 sm:text-[10px] sm:leading-4">{step}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function NotesUpload({ profile }) {
  const [form, setForm] = useState({
    ...emptyForm,
    department: profile.department,
    batch: profile.batch,
    semester: String(profile.semester),
  });
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deletingId, setDeletingId] = useState("");
  const [resubmittingId, setResubmittingId] = useState("");
  const [ocrByNoteId, setOcrByNoteId] = useState({});
  const [verificationByNoteId, setVerificationByNoteId] = useState({});
  const [loadingOcrId, setLoadingOcrId] = useState("");
  const [loadingVerificationId, setLoadingVerificationId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadNotes() {
    const { data } = await api.get("/notes");
    setNotes(data.notes);
  }

  useEffect(() => {
    let active = true;
    api
      .get("/notes")
      .then(({ data }) => {
        if (active) setNotes(data.notes);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoadingNotes(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!notes.some((note) =>
      ["queued", "processing"].includes(note.ocrStatus) ||
      ["queued", "processing"].includes(note.verificationStatus)
    )) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      loadNotes().catch((requestError) => setError(getErrorMessage(requestError)));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [notes]);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function chooseFile(event) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setError("");

    if (!selected) return;
    const extension = selected.name.split(".").pop()?.toLowerCase();
    if (!allowedExtensions.has(extension)) {
      setFile(null);
      event.target.value = "";
      setError("Choose a PDF, JPG, JPEG, or PNG file.");
    } else if (selected.size > maxFileSize) {
      setFile(null);
      event.target.value = "";
      setError("Note files must be 10 MB or smaller.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!file) {
      setError("Choose a note file to upload.");
      return;
    }

    const formData = new FormData();
    for (const [name, value] of Object.entries(form)) {
      formData.append(name, value);
    }
    formData.append("file", file);

    setUploading(true);
    setProgress(0);
    try {
      const { data } = await api.post("/notes", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
        onUploadProgress(event) {
          if (event.total) {
            setProgress(Math.round((event.loaded * 100) / event.total));
          }
        },
      });
      await loadNotes();
      notifyResourceOptionsUpdated();
      setSuccess(data.message);
      setFile(null);
      setForm((current) => ({ ...emptyForm, ...current, title: "", description: "", subject: "", unit: "", topic: "" }));
      const input = document.getElementById("note-file");
      if (input) input.value = "";
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function handleDelete(note) {
    if (!window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
    setError("");
    setSuccess("");
    setDeletingId(note.id);
    try {
      await api.delete(`/notes/${note.id}`);
      notifyResourceOptionsUpdated();
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setOcrByNoteId((current) => {
        const next = { ...current };
        delete next[note.id];
        return next;
      });
      setVerificationByNoteId((current) => {
        const next = { ...current };
        delete next[note.id];
        return next;
      });
      setSuccess("Your note was deleted.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDeletingId("");
    }
  }

  async function handleViewOcr(note) {
    setError("");
    setLoadingOcrId(note.id);
    try {
      const { data } = await api.get(`/notes/${note.id}/ocr`);
      setOcrByNoteId((current) => ({ ...current, [note.id]: data }));
      if (data.ocrStatus !== note.ocrStatus) await loadNotes();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoadingOcrId("");
    }
  }

  async function handleViewVerification(note) {
    setError("");
    setLoadingVerificationId(note.id);
    try {
      const { data } = await api.get(`/notes/${note.id}/verification`);
      setVerificationByNoteId((current) => ({ ...current, [note.id]: data }));
      if (data.verificationStatus !== note.verificationStatus) await loadNotes();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoadingVerificationId("");
    }
  }

  async function handleCorrectedFile(note, event) {
    const correctedFile = event.target.files?.[0];
    if (!correctedFile) return;
    const extension = correctedFile.name.split(".").pop()?.toLowerCase();
    if (!allowedExtensions.has(extension) || correctedFile.size > maxFileSize) {
      setError(
        correctedFile.size > maxFileSize
          ? "Corrected note files must be 10 MB or smaller."
          : "Choose a PDF, JPG, JPEG, or PNG file.",
      );
      event.target.value = "";
      return;
    }

    setError("");
    setSuccess("");
    setResubmittingId(note.id);
    setProgress(0);
    const formData = new FormData();
    formData.append("file", correctedFile);
    try {
      const { data } = await api.post(
        `/notes/${note.id}/resubmissions`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 60000,
          onUploadProgress(progressEvent) {
            if (progressEvent.total) {
              setProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
            }
          },
        },
      );
      await loadNotes();
      setSuccess(data.message);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setResubmittingId("");
      setProgress(0);
      event.target.value = "";
    }
  }

  return (
    <section className="grid items-start gap-5 lg:grid-cols-[0.95fr_1.05fr]" aria-label="Handwritten notes">
      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-[0_12px_36px_-26px_rgba(15,23,42,0.3)] sm:p-6">
        <div className="mb-5">
          <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand">Contribute</span>
          <h2 className="text-lg font-bold text-ink">Upload handwritten notes</h2>
          <p className="mt-1 text-sm text-slate-500">
            PDF, JPG, JPEG, or PNG · up to 10 MB. Notes are public immediately; OCR and AI verification continue separately.
          </p>
        </div>

        {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}
        {success && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{success}</p>}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormField label="Note title" name="title" maxLength={200} onChange={updateField} required value={form.title} />
          <label className="block" htmlFor="description">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Description</span>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              id="description"
              maxLength={2000}
              name="description"
              onChange={updateField}
              required
              rows={3}
              value={form.description}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Department" name="department" maxLength={120} onChange={updateField} required value={form.department} />
            <FormField label="Batch" name="batch" maxLength={30} onChange={updateField} required value={form.batch} />
            <label className="block" htmlFor="semester">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Semester</span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                id="semester"
                name="semester"
                onChange={updateField}
                required
                value={form.semester}
              >
                {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((semester) => (
                  <option key={semester} value={semester}>Semester {semester}</option>
                ))}
              </select>
            </label>
            <FormField label="Subject" name="subject" maxLength={120} onChange={updateField} required value={form.subject} />
            <FormField label="Unit" name="unit" maxLength={80} onChange={updateField} required value={form.unit} />
            <FormField label="Topic" name="topic" maxLength={160} onChange={updateField} required value={form.topic} />
          </div>

          <label className="block" htmlFor="note-file">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Note file</span>
            <input
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand hover:border-indigo-300"
              id="note-file"
              onChange={chooseFile}
              required
              type="file"
            />
          </label>

          {uploading && (
            <div>
              <div className="mb-1 flex justify-between text-xs font-medium text-slate-600">
                <span>{progress === 100 ? "Finishing secure upload…" : "Uploading…"}</span>
                <span>{progress}%</span>
              </div>
              <progress aria-label="Note upload progress" className="h-2 w-full overflow-hidden rounded-full accent-indigo-600" max="100" value={progress} />
            </div>
          )}

          <button
            className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-sm shadow-indigo-950/10 transition hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            disabled={uploading}
            type="submit"
          >
            {uploading ? "Uploading note…" : "Upload note"}
          </button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-[0_12px_36px_-26px_rgba(15,23,42,0.3)] sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-700">My library</span>
            <h2 className="text-lg font-bold text-ink">Your uploaded notes</h2>
            <p className="mt-1 text-sm text-slate-500">Your uploads are public to students; you can still review or delete your own files.</p>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">{notes.length}</span>
        </div>

        {loadingNotes ? (
          <p className="text-sm text-slate-500">Loading your notes…</p>
        ) : notes.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">You haven’t uploaded any notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-indigo-100 hover:shadow-md sm:p-5" key={note.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-ink">{note.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {note.subject} · {note.unit} · Semester {note.semester}
                    </p>
                    <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      note.approvalDecision === "APPROVED" || note.approvalDecision === "APPROVED_WITH_WARNING"
                        ? "bg-emerald-50 text-emerald-700"
                        : note.approvalDecision === "REJECTED"
                          ? "bg-rose-50 text-rose-700"
                          : note.approvalDecision === "NEEDS_HUMAN_REVIEW"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-indigo-50 text-brand"
                    }`}>
                      {verificationLabel(note.approvalDecision, note.publicationStatus)}
                    </p>
                    <NoteVerificationProgress note={note} />
                    {note.approvalDecision !== "PENDING" && (
                      <p className="mt-1 text-xs text-slate-600">
                        {note.confirmedErrorCount} confirmed errors / {note.verifiableStatementCount} verifiable statements
                        {note.mistakePercentage === null
                          ? " · percentage not calculated"
                          : ` · ${note.mistakePercentage.toFixed(2)}% mistakes`}
                      </p>
                    )}
                    {note.humanReviewReason && (
                      <p className="mt-1 text-xs text-amber-800">{note.humanReviewReason}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-600">
                      {ocrStatusLabel(note.ocrStatus)}
                      {note.ocrPageCount ? ` · ${note.ocrPageCount} pages` : ""}
                    </p>
                    {note.ocrError && (
                      <p className="mt-1 text-xs text-rose-700" role="status">{note.ocrError}</p>
                    )}
                    {note.verificationError && (
                      <p className="mt-1 text-xs text-rose-700" role="status">{note.verificationError}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {note.fileName} · {formatFileSize(note.fileSize)}
                    </p>
                    {note.verificationStatus === "completed" && (
                      <button
                        className="mt-3 block text-sm font-semibold text-brand hover:underline disabled:opacity-50"
                        disabled={loadingVerificationId === note.id}
                        onClick={() => handleViewVerification(note)}
                        type="button"
                      >
                        {loadingVerificationId === note.id
                          ? "Loading academic review…"
                          : verificationByNoteId[note.id]
                            ? "Refresh academic review"
                            : "View academic review"}
                      </button>
                    )}
                    {note.verificationStatus === "completed" &&
                      ["REJECTED", "NEEDS_HUMAN_REVIEW"].includes(note.approvalDecision) && (
                      <div className="mt-3">
                        <label className="inline-flex cursor-pointer items-center rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-brand hover:bg-indigo-100">
                          {resubmittingId === note.id
                            ? `Uploading corrected version… ${progress}%`
                            : "Upload an optional corrected version"}
                          <input
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            className="sr-only"
                            disabled={Boolean(resubmittingId)}
                            onChange={(event) => handleCorrectedFile(note, event)}
                            type="file"
                          />
                        </label>
                        <p className="mt-1 text-xs text-slate-500">
                          The new version will also be public immediately. This does not change the original AI report.
                        </p>
                      </div>
                    )}
                    {note.ocrStatus === "completed" && (
                      <button
                        className="mt-2 block text-sm font-semibold text-brand hover:underline disabled:opacity-50"
                        disabled={loadingOcrId === note.id}
                        onClick={() => handleViewOcr(note)}
                        type="button"
                      >
                        {loadingOcrId === note.id
                          ? "Loading recognized text…"
                          : ocrByNoteId[note.id]
                            ? "Refresh recognized text"
                            : "View recognized text"}
                      </button>
                    )}
                    <Link
                      className="mt-2 inline-block text-sm font-semibold text-brand hover:underline"
                      href={`/resources/note/${note.id}`}
                    >
                      View Resource
                    </Link>
                  </div>
                  <button
                    className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    disabled={deletingId === note.id}
                    onClick={() => handleDelete(note)}
                    type="button"
                  >
                    {deletingId === note.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
                {verificationByNoteId[note.id]?.report && (
                  <section className="mt-4 border-t border-slate-100 pt-4" aria-label="Academic verification report">
                    <p className="text-sm font-bold text-ink">
                      Decision: {(verificationByNoteId[note.id].report.decision ?? verificationByNoteId[note.id].decision).replaceAll("_", " ")}
                    </p>
                    {verificationByNoteId[note.id].decisionSource === "admin" && (
                      <p className="mt-2 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
                        Historical administrator decision: {verificationByNoteId[note.id].finalDecision.replaceAll("_", " ")}.
                        {verificationByNoteId[note.id].moderationReason && ` ${verificationByNoteId[note.id].moderationReason}`}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {verificationByNoteId[note.id].report.confirmedErrorCount ?? verificationByNoteId[note.id].confirmedErrorCount} confirmed errors /{" "}
                      {verificationByNoteId[note.id].report.verifiableStatementCount ?? verificationByNoteId[note.id].verifiableStatementCount} verifiable statements
                      {(verificationByNoteId[note.id].report.mistakePercentage ?? verificationByNoteId[note.id].mistakePercentage) === null
                        ? " · mistake percentage not calculated"
                        : ` · ${(verificationByNoteId[note.id].report.mistakePercentage ?? verificationByNoteId[note.id].mistakePercentage).toFixed(2)}% mistakes`}.{" "}
                      {verificationByNoteId[note.id].report.uncertainCount ?? 0} uncertain findings do not count as mistakes. Original notes are unchanged.
                    </p>
                    {(verificationByNoteId[note.id].report.humanReviewReason ?? verificationByNoteId[note.id].humanReviewReason) && (
                      <p className="mt-2 text-sm text-amber-800">
                        Human review: {verificationByNoteId[note.id].report.humanReviewReason ?? verificationByNoteId[note.id].humanReviewReason}
                      </p>
                    )}
                    {verificationByNoteId[note.id].report.issues.length > 0 ? (
                      <ol className="mt-3 space-y-3">
                        {verificationByNoteId[note.id].report.issues.map((issue, index) => (
                          <li className="rounded-lg bg-slate-50 p-3" key={`${note.id}-issue-${index}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-sm font-bold text-ink">
                                Page {issue.pageNumber} · {issue.errorCategory.replaceAll("_", " ")}
                              </h4>
                              <span className={issue.classification === "CONFIRMED_ERROR" ? "text-xs font-semibold text-rose-700" : "text-xs font-semibold text-amber-700"}>
                                {issue.classification.replaceAll("_", " ")} · {Math.round(issue.confidence * 100)}% confidence
                              </span>
                            </div>
                            <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-sm text-slate-700">
                              {issue.originalStatement}
                            </blockquote>
                            <p className="mt-2 text-sm text-slate-700">{issue.issueDescription}</p>
                            {issue.suggestedCorrection && (
                              <p className="mt-2 text-sm text-slate-700">
                                <span className="font-semibold">Suggested correction:</span> {issue.suggestedCorrection}
                              </p>
                            )}
                            <p className="mt-2 text-xs text-slate-600">{issue.verificationEvidence}</p>
                            {issue.references.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {issue.references.map((reference) => (
                                  <li key={reference.url}>
                                    <a className="text-xs font-medium text-brand hover:underline" href={reference.url} rel="noreferrer" target="_blank">
                                      {reference.title}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">
                        {verificationByNoteId[note.id].report.overallClassification === "NO_ISSUE_DETECTED"
                          ? "No substantive academic issues were detected."
                          : "No specific academic issues were detected."}
                      </p>
                    )}
                    {verificationByNoteId[note.id].history?.length > 0 && (
                      <details className="mt-4 border-t border-slate-200 pt-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                          Verification history ({verificationByNoteId[note.id].history.length})
                        </summary>
                        <ol className="mt-3 space-y-3">
                          {verificationByNoteId[note.id].history.map((entry) => (
                            <li className="rounded-lg border border-slate-200 p-3" key={`${note.id}-revision-${entry.revisionNumber}-attempt-${entry.attempt}`}>
                              <p className="text-sm font-semibold text-ink">
                                Version {entry.revisionNumber}, review {entry.attempt}: {entry.decision.replaceAll("_", " ")}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                {entry.confirmedErrorCount} confirmed / {entry.verifiableStatementCount} verifiable statements
                                {entry.mistakePercentage === null
                                  ? " · sent for human review"
                                  : ` · ${entry.mistakePercentage.toFixed(2)}%`}
                              </p>
                              {entry.report.issues.length > 0 && (
                                <ul className="mt-2 space-y-2">
                                  {entry.report.issues.map((issue, index) => (
                                    <li className="text-xs text-slate-700" key={`${entry.revisionNumber}-${entry.attempt}-${index}`}>
                                      Page {issue.pageNumber}: {issue.classification.replaceAll("_", " ")} — {issue.originalStatement}
                                      {issue.suggestedCorrection && ` Suggested correction: ${issue.suggestedCorrection}`}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </section>
                )}
                {ocrByNoteId[note.id]?.pages && (
                  <ol className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    {ocrByNoteId[note.id].pages.map((page) => (
                      <li className="rounded-lg bg-slate-50 p-3" key={page.pageNumber}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-sm font-bold text-ink">Page {page.pageNumber}</h4>
                          <span className="text-xs text-slate-600">
                            {page.readabilityStatus.replaceAll("_", " ")} · {Math.round(page.ocrConfidence * 100)}% confidence
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                          {page.extractedText || "No readable text recognized."}
                        </p>
                        {page.recognizedFormulas.length > 0 && (
                          <div className="mt-2">
                            <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Recognized formulas</h5>
                            <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
                              {page.recognizedFormulas.map((formula, index) => <li key={`${page.pageNumber}-${index}`}>{formula}</li>)}
                            </ul>
                          </div>
                        )}
                        {page.unclearRegions.length > 0 && (
                          <p className="mt-2 text-xs text-amber-800">
                            Unclear handwriting (not judged incorrect): {page.unclearRegions.join("; ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
