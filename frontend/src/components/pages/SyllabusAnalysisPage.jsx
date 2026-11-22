"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, RefreshCw } from "lucide-react";
import Panel from "../Panel.jsx";
import { api } from "../../lib/api.js";
import { usePageMotion } from "../../lib/usePageMotion.js";

const emptyStructure = { subjects: [] };

function errorText(error) {
  return error.response?.data?.message ?? error.message ?? "Syllabus analysis failed.";
}

function normalizeClientStructure(value = emptyStructure) {
  return {
    course: value.course ?? null,
    semester: value.semester ?? null,
    subjects: (value.subjects ?? []).map((subject) => ({
      subjectName: subject.subjectName ?? subject.name ?? "",
      subjectCode: subject.subjectCode ?? null,
      units: (subject.units ?? []).map((unit) => ({
        unitNumber: unit.unitNumber ?? null,
        unitTitle: unit.unitTitle ?? unit.name ?? "",
        topics: (unit.topics ?? []).map((topic) => ({
          topicName: topic.topicName ?? topic.name ?? "",
          subtopics: topic.subtopics ?? [],
        })),
      })),
    })),
  };
}

function formatOutline(structure) {
  return [
    `Course: ${structure.course ?? "Not specified"}`,
    `Semester: ${structure.semester ?? "Not specified"}`,
    ...structure.subjects.map((subject) => [
      `${subject.subjectName}${subject.subjectCode ? ` (${subject.subjectCode})` : ""}`,
      ...subject.units.map((unit) => [
        `  ${unit.unitNumber ? `Unit ${unit.unitNumber}: ` : ""}${unit.unitTitle}`,
        ...unit.topics.flatMap((topic) => [
          `    - ${topic.topicName}`,
          ...topic.subtopics.map((subtopic) => `      • ${subtopic}`),
        ]),
      ].join("\n")),
    ].join("\n")),
  ].join("\n\n");
}

function ResourceCard({ resource }) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="break-words font-bold text-ink">{resource.title}</h4>
          <p className="mt-1 break-words text-sm text-slate-600">{resource.description || resource.subject}</p>
          {resource.type === "note" && (
            <p className="mt-1 text-xs text-slate-500">
              {[resource.unit, resource.topic, resource.department].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <Link
          className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700"
          href={`/resources/${resource.type}/${resource.id}`}
        >
          View Resource
        </Link>
      </div>
    </article>
  );
}

export default function SyllabusAnalysisPage() {
  const rootRef = useRef(null);
  const [analyses, setAnalyses] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [structure, setStructure] = useState(emptyStructure);
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const [reviewedPartialPages, setReviewedPartialPages] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api.get("/syllabus-analyses")
      .then(({ data }) => setAnalyses(data.analyses))
      .catch((requestError) => setError(errorText(requestError)));
  }, []);

  function applyAnalysis(nextAnalysis) {
    setAnalysis(nextAnalysis);
    setStructure(normalizeClientStructure(nextAnalysis.structure));
    setDirty(false);
    setReviewedPartialPages(false);
    setError("");
    setNotice("");
  }

  async function loadAnalysis(id) {
    setBusy("loading");
    setError("");
    try {
      const { data } = await api.get(`/syllabus-analyses/${id}`);
      applyAnalysis(data.analysis);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy("");
    }
  }

  async function uploadSyllabus(event) {
    event.preventDefault();
    if (!file) {
      setError("Choose a syllabus PDF or image.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setBusy("uploading");
    setUploadProgress(0);
    setError("");
    setNotice("");
    try {
      const { data } = await api.post("/syllabus-analyses", formData, {
        timeout: 0,
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress(event) {
          if (event.total) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      applyAnalysis(data.analysis);
      setFile(null);
      event.target.reset();
      setAnalyses((current) => [
        data.analysis,
        ...current.filter((item) => item.id !== data.analysis.id),
      ]);
      setNotice(data.message);
    } catch (requestError) {
      setError(errorText(requestError));
      if (requestError.response?.data?.analysis) {
        const failedAnalysis = requestError.response.data.analysis;
        setAnalyses((current) => [
          failedAnalysis,
          ...current.filter((item) => item.id !== failedAnalysis.id),
        ]);
      }
    } finally {
      setBusy("");
      setUploadProgress(null);
    }
  }

  function updateStructure(updater) {
    setStructure((current) => updater(structuredClone(current)));
    setDirty(true);
  }

  function editSubject(subjectIndex, name) {
    updateStructure((value) => {
      value.subjects[subjectIndex].subjectName = name;
      return value;
    });
  }

  function editCourse(course) {
    updateStructure((value) => {
      value.course = course;
      return value;
    });
  }

  function editSemester(semester) {
    updateStructure((value) => {
      value.semester = semester;
      return value;
    });
  }

  function editSubjectCode(subjectIndex, subjectCode) {
    updateStructure((value) => {
      value.subjects[subjectIndex].subjectCode = subjectCode;
      return value;
    });
  }

  function editUnit(subjectIndex, unitIndex, name) {
    updateStructure((value) => {
      value.subjects[subjectIndex].units[unitIndex].unitTitle = name;
      return value;
    });
  }

  function editUnitNumber(subjectIndex, unitIndex, unitNumber) {
    updateStructure((value) => {
      value.subjects[subjectIndex].units[unitIndex].unitNumber = unitNumber;
      return value;
    });
  }

  function editTopic(subjectIndex, unitIndex, topicIndex, name) {
    updateStructure((value) => {
      value.subjects[subjectIndex].units[unitIndex].topics[topicIndex].topicName = name;
      return value;
    });
  }

  function editSubtopic(subjectIndex, unitIndex, topicIndex, subtopicIndex, name) {
    updateStructure((value) => {
      value.subjects[subjectIndex].units[unitIndex].topics[topicIndex]
        .subtopics[subtopicIndex] = name;
      return value;
    });
  }

  async function saveCorrections() {
    if (!analysis) return;
    setBusy("saving");
    setError("");
    setNotice("");
    try {
      const { data } = await api.put(`/syllabus-analyses/${analysis.id}`, { structure });
      applyAnalysis(data.analysis);
      setAnalyses((current) => current.map((item) =>
        item.id === data.analysis.id ? data.analysis : item,
      ));
      setNotice(data.message);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy("");
    }
  }

  async function confirmSyllabus() {
    const hasPartialPages = analysis?.pages?.some(
      (page) => page.readabilityStatus === "partially_readable",
    );
    if (!analysis || dirty || (hasPartialPages && !reviewedPartialPages)) return;
    setBusy("matching");
    setError("");
    setNotice("");
    try {
      const { data } = await api.post(`/syllabus-analyses/${analysis.id}/confirm`, {
        reviewedPartialPages,
      });
      applyAnalysis(data.analysis);
      setAnalyses((current) => current.map((item) =>
        item.id === data.analysis.id ? data.analysis : item,
      ));
      setNotice(data.message);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy("");
    }
  }

  async function regenerateOutline() {
    if (!analysis || dirty) return;
    setBusy("regenerating");
    setError("");
    setNotice("");
    try {
      const { data } = await api.post(`/syllabus-analyses/${analysis.id}/regenerate`);
      applyAnalysis(data.analysis);
      setAnalyses((current) => current.map((item) =>
        item.id === data.analysis.id ? data.analysis : item,
      ));
      setNotice(data.message);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy("");
    }
  }

  async function copyOutline() {
    try {
      await navigator.clipboard.writeText(formatOutline(structure));
      setError("");
      setNotice("The extracted outline was copied to your clipboard.");
    } catch (copyError) {
      setError(copyError.message || "Could not copy the outline. Check your browser clipboard permissions.");
    }
  }

  const hasPartialPages = analysis?.pages?.some(
    (page) => page.readabilityStatus === "partially_readable",
  );

  usePageMotion(rootRef, {
    dependencies: [analysis?.id, analyses.length, busy, structure.subjects.length],
  });

  return (
    <main className="ed-syllabus-page" ref={rootRef}>
      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:space-y-6 sm:px-8 sm:py-10">
        <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-white to-indigo-50 px-5 py-7 shadow-sm sm:px-8 sm:py-9" data-motion-intro>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand sm:text-sm">Study from your curriculum</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Syllabus analysis</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Upload a syllabus to extract its subjects, units, topics, and subtopics.
            Review the outline before searching public notes and PYQs.
          </p>
        </div>

        {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}</p>}
        {notice && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{notice}</p>}

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
          <aside className="min-w-0 space-y-5 sm:space-y-6">
            <Panel data-motion-scroll>
              <h2 className="text-lg font-bold text-ink">Upload syllabus</h2>
              <p className="mt-1 text-sm text-slate-600">PDF, JPG, JPEG, or PNG · up to 10 MB</p>
              <form className="mt-4 space-y-4" onSubmit={uploadSyllabus}>
                <input
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  className="block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-brand"
                  disabled={Boolean(busy)}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  type="file"
                />
                <button
                  className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!file || Boolean(busy)}
                  type="submit"
                >
                  {busy === "uploading" ? "Uploading and analyzing…" : "Analyze syllabus"}
                </button>
                {busy === "uploading" && (
                  <div aria-live="polite">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${uploadProgress ?? 0}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {uploadProgress === 100
                        ? "Upload complete. Extracting and organizing syllabus pages…"
                        : `Uploading ${uploadProgress ?? 0}%`}
                    </p>
                  </div>
                )}
              </form>
            </Panel>

            <Panel data-motion-scroll>
              <h2 className="text-lg font-bold text-ink">Your analyses</h2>
              {analyses.length ? (
                <ul className="mt-3 space-y-2">
                  {analyses.map((item) => (
                    <li data-motion-stagger key={item.id}>
                      <button
                        className={`w-full min-w-0 rounded-xl border p-3 text-left transition ${analysis?.id === item.id ? "border-indigo-300 bg-indigo-50 shadow-sm" : "border-slate-200 hover:bg-slate-50"}`}
                        disabled={Boolean(busy)}
                        onClick={() => loadAnalysis(item.id)}
                        type="button"
                      >
                        <span className="block truncate text-sm font-semibold text-ink">{item.fileName}</span>
                        <span className="mt-1 block text-xs capitalize text-slate-500">
                          {item.status.replaceAll("_", " ")} · {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Your uploaded syllabuses will appear here.</p>
              )}
            </Panel>
          </aside>

          <div className="min-w-0 space-y-5 sm:space-y-6">
            {analysis ? (
              <>
                <Panel data-motion-scroll>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="break-all text-xl font-bold text-ink">{analysis.fileName}</h2>
                      <p className="mt-1 text-sm text-slate-500">{analysis.pageCount} page(s) · {analysis.status}</p>
                    </div>
                    {analysis.status === "review" && (
                      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                        <button
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
                          disabled={dirty || Boolean(busy)}
                          onClick={regenerateOutline}
                          type="button"
                        >
                          <RefreshCw aria-hidden="true" className="mr-2 inline size-4" />
                          {busy === "regenerating" ? "Regenerating…" : "Regenerate"}
                        </button>
                        <button
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
                          disabled={!dirty || Boolean(busy)}
                          onClick={saveCorrections}
                          type="button"
                        >
                          {busy === "saving" ? "Saving…" : "Save corrections"}
                        </button>
                        <button
                          className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          disabled={dirty || Boolean(busy) || (hasPartialPages && !reviewedPartialPages)}
                          onClick={confirmSyllabus}
                          type="button"
                        >
                          {busy === "matching" ? "Finding resources…" : "Confirm and find resources"}
                        </button>
                      </div>
                    )}
                    {["review", "confirmed"].includes(analysis.status) && (
                      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                        {analysis.status === "confirmed" && (
                          <button
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
                            disabled={Boolean(busy)}
                            onClick={regenerateOutline}
                            type="button"
                          >
                            <RefreshCw aria-hidden="true" className="mr-2 inline size-4" />
                            {busy === "regenerating" ? "Regenerating…" : "Regenerate"}
                          </button>
                        )}
                        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700" onClick={copyOutline} type="button">
                          <Copy aria-hidden="true" className="mr-2 inline size-4" />Copy topics
                        </button>
                      </div>
                    )}
                  </div>
                  {analysis.status === "review" && (
                    <div className="mt-3 space-y-3">
                      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                        Check the extracted outline. AI extraction can miss or misread text; edits are saved before any resource search.
                      </p>
                      {hasPartialPages && (
                        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-950">
                          <input
                            checked={reviewedPartialPages}
                            className="mt-1"
                            onChange={(event) => setReviewedPartialPages(event.target.checked)}
                            type="checkbox"
                          />
                          <span>
                            I reviewed the source text for partially readable pages and corrected any missing syllabus content above.
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                  {analysis.status === "failed" && (
                    <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{analysis.processingError}</p>
                  )}
                  {analysis.status === "processing" && (
                    <p className="mt-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800">
                      This syllabus is still being analyzed. Reload its status shortly.
                    </p>
                  )}
                  {analysis.status === "review" ? (
                      <fieldset disabled={Boolean(busy)} className="mt-5 min-w-0 space-y-5">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-semibold text-slate-700">
                          Course / program
                          <input
                            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"
                            onChange={(event) => editCourse(event.target.value)}
                            value={structure.course ?? ""}
                          />
                        </label>
                        <label className="text-sm font-semibold text-slate-700">
                          Semester
                          <input
                            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"
                            min="1"
                            max="12"
                            onChange={(event) => editSemester(event.target.value)}
                            type="number"
                            value={structure.semester ?? ""}
                          />
                        </label>
                      </div>
                      {structure.subjects.map((subject, subjectIndex) => (
                        <details className="min-w-0 rounded-xl border border-indigo-100 bg-white shadow-sm" key={`subject-${subjectIndex}`} open>
                          <summary className="cursor-pointer px-4 py-3 font-semibold text-ink">
                            {subject.subjectName || `Subject ${subjectIndex + 1}`}
                            {subject.subjectCode ? ` · ${subject.subjectCode}` : ""}
                          </summary>
                        <section className="min-w-0 rounded-xl border border-indigo-100 bg-white p-3 shadow-sm sm:p-4" key={`subject-${subjectIndex}`}>
                          <div className="flex items-center gap-2">
                            <input
                              aria-label="Subject name"
                              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-bold text-ink"
                              onChange={(event) => editSubject(subjectIndex, event.target.value)}
                              value={subject.subjectName}
                            />
                            <input
                              aria-label="Subject code"
                              className="w-36 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              onChange={(event) => editSubjectCode(subjectIndex, event.target.value)}
                              placeholder="Subject code"
                              value={subject.subjectCode ?? ""}
                            />
                            <button
                              aria-label="Remove subject"
                              className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                              onClick={() => updateStructure((value) => {
                                value.subjects.splice(subjectIndex, 1);
                                return value;
                              })}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="mt-4 space-y-4">
                            {subject.units.map((unit, unitIndex) => (
                              <details className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:p-4" key={`unit-${unitIndex}`} open>
                                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                                  {unit.unitNumber ? `Unit ${unit.unitNumber}: ` : "Unit: "}{unit.unitTitle || "Untitled"}
                                </summary>
                                <div className="mt-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    aria-label="Unit number"
                                    className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                    min="1"
                                    onChange={(event) => editUnitNumber(subjectIndex, unitIndex, event.target.value)}
                                    placeholder="Number"
                                    type="number"
                                    value={unit.unitNumber ?? ""}
                                  />
                                  <input
                                    aria-label="Unit name"
                                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                                    onChange={(event) => editUnit(subjectIndex, unitIndex, event.target.value)}
                                    value={unit.unitTitle}
                                  />
                                  <button
                                    className="text-xs font-semibold text-rose-700"
                                    onClick={() => updateStructure((value) => {
                                      value.subjects[subjectIndex].units.splice(unitIndex, 1);
                                      return value;
                                    })}
                                    type="button"
                                  >
                                    Remove unit
                                  </button>
                                </div>
                                <div className="mt-3 space-y-3">
                                  {unit.topics.map((topic, topicIndex) => (
                                    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" key={`topic-${topicIndex}`}>
                                      <div className="flex items-center gap-2">
                                        <input
                                          aria-label="Topic name"
                                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                          onChange={(event) => editTopic(subjectIndex, unitIndex, topicIndex, event.target.value)}
                                          value={topic.topicName}
                                        />
                                        <button
                                          className="text-xs font-semibold text-rose-700"
                                          onClick={() => updateStructure((value) => {
                                            value.subjects[subjectIndex].units[unitIndex].topics.splice(topicIndex, 1);
                                            return value;
                                          })}
                                          type="button"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                      <div className="mt-2 space-y-2">
                                        {topic.subtopics.map((subtopic, subtopicIndex) => (
                                          <div className="flex gap-2" key={`subtopic-${subtopicIndex}`}>
                                            <input
                                              aria-label="Subtopic"
                                              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                              onChange={(event) => editSubtopic(subjectIndex, unitIndex, topicIndex, subtopicIndex, event.target.value)}
                                              value={subtopic}
                                            />
                                            <button
                                              className="px-2 text-xs font-semibold text-rose-700"
                                              onClick={() => updateStructure((value) => {
                                                value.subjects[subjectIndex].units[unitIndex].topics[topicIndex]
                                                  .subtopics.splice(subtopicIndex, 1);
                                                return value;
                                              })}
                                              type="button"
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        ))}
                                        <button
                                          className="text-xs font-semibold text-brand"
                                          onClick={() => updateStructure((value) => {
                                            value.subjects[subjectIndex].units[unitIndex].topics[topicIndex]
                                              .subtopics.push("");
                                            return value;
                                          })}
                                          type="button"
                                        >
                                          + Add subtopic
                                        </button>
                                      </div>
                                      </div>
                                  ))}
                                  <button
                                    className="text-sm font-semibold text-brand"
                                    onClick={() => updateStructure((value) => {
                                      value.subjects[subjectIndex].units[unitIndex].topics.push({
                                        topicName: "",
                                        subtopics: [],
                                      });
                                      return value;
                                    })}
                                    type="button"
                                  >
                                    + Add topic
                                  </button>
                                </div>
                              </div>
                              </details>
                            ))}
                            <button
                              className="text-sm font-semibold text-brand"
                              onClick={() => updateStructure((value) => {
                                value.subjects[subjectIndex].units.push({
                                  unitNumber: null,
                                  unitTitle: "",
                                  topics: [],
                                });
                                return value;
                              })}
                              type="button"
                            >
                              + Add unit
                            </button>
                          </div>
                        </section>
                        </details>
                      ))}
                      <button
                        className="rounded-xl border border-dashed border-indigo-300 px-4 py-3 text-sm font-bold text-brand hover:bg-indigo-50"
                        onClick={() => updateStructure((value) => {
                          value.subjects.push({
                            subjectName: "",
                            subjectCode: null,
                            units: [],
                          });
                          return value;
                        })}
                        type="button"
                      >
                        + Add subject
                      </button>
                    </fieldset>
                  ) : (
                    <div className="mt-5 space-y-4">
                      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                        Course: <strong>{structure.course || "Not specified"}</strong>
                        <span className="px-2">·</span>
                        Semester: <strong>{structure.semester || "Not specified"}</strong>
                      </p>
                      {structure.subjects.map((subject, subjectIndex) => (
                        <details className="rounded-xl border border-slate-200 p-4" key={`${subject.subjectName}-${subjectIndex}`} open>
                          <summary className="cursor-pointer text-lg font-bold text-ink">
                            {subject.subjectName}{subject.subjectCode ? ` · ${subject.subjectCode}` : ""}
                          </summary>
                          <div className="mt-3 space-y-3">
                            {subject.units.map((unit, unitIndex) => (
                              <details key={`${unit.unitTitle}-${unitIndex}`} open>
                                <summary className="cursor-pointer font-semibold text-slate-700">
                                  {unit.unitNumber ? `Unit ${unit.unitNumber}: ` : ""}{unit.unitTitle}
                                </summary>
                                <ul className="mt-1 space-y-2">
                                  {unit.topics.map((topic, topicIndex) => (
                                    <li className="text-sm text-slate-700" key={`${topic.topicName}-${topicIndex}`}>
                                      <span className="font-medium">{topic.topicName}</span>
                                      {topic.subtopics.length > 0 && (
                                        <span className="text-slate-500"> — {topic.subtopics.join(", ")}</span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                  {analysis.pages?.length > 0 && (
                    <details className="mt-5 rounded-xl border border-slate-200 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Review extracted source text</summary>
                      <div className="mt-3 space-y-4">
                        {analysis.pages.map((page) => (
                          <section key={page.pageNumber}>
                            <h3 className="text-sm font-bold text-slate-700">
                              Page {page.pageNumber} · {page.readabilityStatus.replaceAll("_", " ")}
                            </h3>
                            <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{page.extractedText || "No readable text extracted."}</pre>
                          </section>
                        ))}
                      </div>
                    </details>
                  )}
                </Panel>

                {analysis.status === "confirmed" && analysis.resources && (
                  <ResourceResults resources={analysis.resources} />
                )}
              </>
            ) : (
              <Panel className="grid min-h-64 place-items-center text-center" data-motion-scroll>
                <div>
                  <h2 className="text-lg font-bold text-ink">Your syllabus outline will appear here</h2>
                  <p className="mt-2 max-w-md text-sm text-slate-600">
                    After extraction, review and correct the structure. Platform resources are searched only after you confirm it.
                  </p>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function ResourceResults({ resources }) {
  const allTopics = resources.subjects.flatMap((subject) =>
    subject.units.flatMap((unit) => unit.topics),
  );
  return (
    <div className="space-y-6">
      <Panel>
        <h2 className="text-xl font-bold text-ink">Missing topics</h2>
        <p className="mt-1 text-sm text-slate-600">
          These topics did not match any available public notes. PYQs are matched at subject level.
        </p>
        {resources.missingTopics.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {resources.missingTopics.map((topic, index) => (
              <li className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950" key={`${topic.subject}-${topic.unit}-${topic.topic}-${index}`}>
                <span className="font-semibold">{topic.topic}</span>
                <span className="block text-xs text-amber-800">{topic.subject} · {topic.unit}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            {!allTopics.length
              ? "No syllabus topics were available to match."
              : allTopics.every((topic) => topic.notes.length > 0)
                ? "Every topic matched at least one public note."
                : "No topics were confirmed as missing."}
          </p>
        )}
        {allTopics.some((topic) => !topic.coverageComplete) && (
          <p className="mt-2 text-sm text-slate-600">{resources.topicCoverageNote}</p>
        )}
      </Panel>

      {resources.subjects.map((subject, subjectIndex) => (
        <Panel data-motion-stagger key={`${subject.subject}-${subjectIndex}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-ink">{subject.subject}</h2>
            <div className="flex gap-2 text-xs font-semibold">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-brand">{subject.notes.length}{subject.notesTruncated ? "+" : ""} related notes</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{subject.pyqs.length}{subject.pyqsTruncated ? "+" : ""} related PYQs</span>
            </div>
          </div>
          <div className="mt-5 space-y-5">
            {subject.units.map((unit, unitIndex) => (
              <section key={`${unit.name}-${unitIndex}`}>
                <h3 className="font-bold text-slate-800">{unit.name}</h3>
                {unit.topics.map((topic, topicIndex) => (
                  <details className="mt-3 rounded-xl bg-slate-50 p-4" key={`${topic.name}-${topicIndex}`}>
                    <summary className="cursor-pointer font-semibold text-ink">
                      {topic.name} <span className="ml-1 text-xs font-medium text-brand">Find resources</span>
                    </summary>
                    {topic.subtopics.length > 0 && (
                      <p className="mt-2 text-sm text-slate-500">{topic.subtopics.join(", ")}</p>
                    )}
                    {topic.notes.length ? (
                      <div className="mt-3 space-y-2">
                        <h4 className="text-sm font-bold text-slate-700">Matching notes</h4>
                        {topic.notes.map((note) => <ResourceCard key={note.id} resource={note} />)}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-amber-800">
                        {topic.coverageComplete
                          ? "No matching public notes were found for this topic."
                          : "No match in the most recent subject notes; older resources may match."}
                      </p>
                    )}
                    {topic.pyqs?.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <h4 className="text-sm font-bold text-slate-700">Matching question papers</h4>
                        {topic.pyqs.map((pyq) => <ResourceCard key={pyq.id} resource={pyq} />)}
                      </div>
                    )}
                    {!topic.notes.length && !topic.pyqs?.length && (
                      <p className="mt-2 text-sm text-slate-600">No matching question papers are currently available.</p>
                    )}
                  </details>
                ))}
              </section>
            ))}
          </div>
          {subject.notes.length > 0 && (
            <section className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="font-bold text-ink">Notes matched to this syllabus</h3>
              <div className="mt-3 space-y-2">
                {subject.notes.map((note) => <ResourceCard key={note.id} resource={note} />)}
              </div>
              {subject.notesTruncated && (
                <p className="mt-2 text-sm text-slate-500">Showing the 100 most recent notes. More public notes are available.</p>
              )}
            </section>
          )}
          <section className="mt-6 border-t border-slate-200 pt-5">
            <h3 className="font-bold text-ink">Related PYQs <span className="text-xs font-normal text-slate-500">(subject-level matches)</span></h3>
            <p className="mt-1 text-sm text-slate-500">{resources.note}</p>
            {subject.pyqs.length ? (
              <div className="mt-3 space-y-2">
                {subject.pyqs.map((pyq) => <ResourceCard key={pyq.id} resource={pyq} />)}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">No public PYQs are currently available for this subject.</p>
            )}
            {subject.pyqsTruncated && (
              <p className="mt-2 text-sm text-slate-500">Showing the 100 most recent public PYQs.</p>
            )}
          </section>
        </Panel>
      ))}
    </div>
  );
}
