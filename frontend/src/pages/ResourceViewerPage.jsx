"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "../lib/api.js";
import { PageLoader } from "../components/PageState.jsx";
import AdaptiveTutor from "../components/AdaptiveTutor.jsx";
import { usePageMotion } from "../lib/usePageMotion.js";
import { useAuth } from "../context/AuthContext.jsx";
import NoteBookReader from "../components/NoteBookReader.jsx";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const minimumZoom = 0.5;
const maximumZoom = 2.5;
const zoomStep = 0.25;

function messageFrom(error) {
  return error.response?.data?.message ?? error.message ?? "This resource could not be opened.";
}

export default function ResourceViewerPage({ resourceType = "", resourceId = "" }) {
  if (resourceType === "note") return <NoteBookReader resourceId={resourceId} />;
  return <QuestionPaperViewer resourceType={resourceType} resourceId={resourceId} />;
}

function QuestionPaperViewer({ resourceType = "", resourceId = "" }) {
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const activityRecordRef = useRef("");
  const activityOpenIdRef = useRef("");
  const { user } = useAuth();
  const [fileUrl, setFileUrl] = useState("");
  const [format, setFormat] = useState("");
  const [uploaderName, setUploaderName] = useState("");
  const [document, setDocument] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activityError, setActivityError] = useState("");

  const recordResourceOpen = useCallback(async () => {
    if (user?.role !== "user") return;
    const key = `${resourceType}:${resourceId}`;
    if (activityRecordRef.current === key) return;
    activityRecordRef.current = key;
    if (!activityOpenIdRef.current) activityOpenIdRef.current = crypto.randomUUID();
    setActivityError("");
    try {
      await api.post("/learning-activity/open", {
        resourceType,
        resourceId,
        openId: activityOpenIdRef.current,
      });
    } catch (requestError) {
      activityRecordRef.current = "";
      setActivityError(
        requestError.response?.data?.message ??
          requestError.message ??
          "Your resource activity could not be saved.",
      );
    }
  }, [resourceId, resourceType, user?.role]);

  usePageMotion(rootRef, { dependencies: [loading, resourceId] });

  useEffect(() => {
    activityRecordRef.current = "";
    activityOpenIdRef.current = crypto.randomUUID();
    let active = true;
    let nextUrl = "";
    let loadingTask;
    setLoading(true);
    setError("");
    setDocument(null);
    setFileUrl("");
    setUploaderName("");

    async function openResource() {
      try {
        const { data: info } = await api.get(
          `/search/resources/${resourceType}/${resourceId}/view-info`,
        );
        if (!active) return;
        const resourceFormat = info.resource.format ?? "";
        setFormat(resourceFormat);
        setUploaderName(info.resource.uploaderName ?? "");
        if (!["pdf", "jpg", "jpeg", "png"].includes(resourceFormat)) {
          throw new Error("The resource file format is not supported.");
        }

        if (resourceFormat === "pdf") {
          const resourceUrl = `${api.defaults.baseURL.replace(/\/+$/, "")}/search/resources/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/view`;
          loadingTask = getDocument({
            url: resourceUrl,
            withCredentials: true,
            rangeChunkSize: 64 * 1024,
            disableAutoFetch: true,
            disableStream: true,
          });
          const pdf = await loadingTask.promise;
          if (!active) return;
          setDocument(pdf);
          setPageNumber(1);
        } else {
          const { data: image } = await api.get(
            `/search/resources/${resourceType}/${resourceId}/view`,
            { responseType: "blob" },
          );
          if (!active) return;
          nextUrl = URL.createObjectURL(image);
          setFileUrl(nextUrl);
        }
        setLoading(false);
      } catch (requestError) {
        if (active) {
          setError(messageFrom(requestError));
          setLoading(false);
        }
      }
    }

    void openResource();

    return () => {
      active = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      void loadingTask?.destroy();
    };
  }, [resourceId, resourceType]);

  useEffect(() => {
    if (!document || !canvasRef.current) return undefined;
    let active = true;
    let renderTask;
    document.getPage(pageNumber)
      .then((page) => {
        if (!active || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Your browser could not create a PDF viewer.");
        const pixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: zoom });
        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        return renderTask.promise.then(() => {
          if (active && pageNumber === 1) void recordResourceOpen();
        });
      })
      .catch((renderError) => {
        if (active && renderError.name !== "RenderingCancelledException") {
          setError(messageFrom(renderError));
        }
      });
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber, recordResourceOpen, zoom]);

  useEffect(() => {
    if (!document) return undefined;
    function handlePageKey(event) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName) ||
        event.target?.isContentEditable
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        setPageNumber((current) => Math.max(1, current - 1));
      } else if (event.key === "ArrowRight") {
        setPageNumber((current) => Math.min(document.numPages, current + 1));
      }
    }

    window.addEventListener("keydown", handlePageKey);
    return () => window.removeEventListener("keydown", handlePageKey);
  }, [document]);

  function changePage(value) {
    const nextPage = Number(value);
    if (Number.isInteger(nextPage) && nextPage >= 1 && nextPage <= (document?.numPages ?? 1)) {
      setPageNumber(nextPage);
    }
  }

  const readingProgress = document
    ? Math.round((pageNumber / document.numPages) * 100)
    : 0;
  const uploaderLabel = uploaderName || "Uploader unavailable";

  if (loading) return <PageLoader label="Opening resource securely…" />;

  return (
    <main className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[#fff9ec] px-4 py-6 sm:px-8 sm:py-9" ref={rootRef}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-20 h-72 w-72 rounded-full bg-orange-200/30 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-28 top-[34rem] h-80 w-80 rounded-full bg-violet-200/25 blur-3xl" />
      <section className="relative mx-auto max-w-7xl">
        <Link
          className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-400 hover:text-brand"
          data-motion-intro
          href="/search"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Back to Explore
        </Link>

        <header className="ed-viewer-hero relative mb-6 flex flex-col justify-between gap-5 overflow-hidden rounded-[1.75rem] border border-orange-100 bg-gradient-to-br from-white via-white to-orange-50 p-5 shadow-[0_18px_55px_-38px_rgba(74,49,24,0.42)] sm:p-7 lg:flex-row lg:items-center" data-motion-intro>
          <div aria-hidden="true" className="ed-viewer-orb ed-viewer-orb-one" />
          <div aria-hidden="true" className="ed-viewer-orb ed-viewer-orb-two" />
          <div className="relative z-10 flex min-w-0 items-start gap-4">
            <span className="ed-viewer-cover grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-orange-200 bg-orange-100 text-brand shadow-inner">
              {resourceType === "note"
                ? <BookOpen aria-hidden="true" size={26} />
                : <FileText aria-hidden="true" size={26} />}
            </span>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-[0.17em] text-brand">
                  {resourceType === "note" ? "Student study note" : "Question paper"}
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                  Secure viewer
                </span>
              </div>
              <h1 className="truncate text-2xl font-black tracking-tight text-ink sm:text-3xl" title={uploaderLabel}>
                {uploaderLabel}
              </h1>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                {uploaderName ? (
                  <> <Eye aria-hidden="true" size={15} /> Shared by {uploaderName} </>
                ) : (
                  <> <Eye aria-hidden="true" size={15} /> This uploader's profile is no longer available </>
                )}
              </p>
            </div>
          </div>
          <div className="relative z-10 flex flex-wrap items-center gap-2 pl-[4.5rem] lg:pl-0">
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
              <FileText aria-hidden="true" className="text-brand" size={15} />
              {format ? format.toUpperCase() : "RESOURCE"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
              <ShieldCheck aria-hidden="true" className="text-emerald-600" size={15} />
              Viewing only
            </span>
          </div>
          <svg
            aria-hidden="true"
            className="ed-viewer-illustration"
            fill="none"
            viewBox="0 0 250 190"
          >
            <circle className="ed-viewer-orbit" cx="139" cy="94" r="67" />
            <circle className="ed-viewer-orbit ed-viewer-orbit-inner" cx="139" cy="94" r="48" />
            <path
              className="ed-viewer-book-shadow"
              d="M75 132c18-8 39-8 61 2 21-10 42-10 62-2v18c-20-8-41-8-62 2-22-10-43-10-61-2v-18Z"
            />
            <g className="ed-viewer-book">
              <path d="M75 79c19-8 40-7 61 3v52c-21-10-42-11-61-3V79Z" fill="#FFFDF8" stroke="#26211E" strokeWidth="2.5" />
              <path d="M136 82c21-10 42-11 62-3v52c-20-8-41-7-62 3V82Z" fill="#FFE6D7" stroke="#26211E" strokeWidth="2.5" />
              <path d="M136 82v52" stroke="#26211E" strokeWidth="2.5" />
              <path d="M88 91c11-3 22-2 33 2M88 101c11-3 22-2 33 2M150 93c11-4 22-5 34-2M150 103c11-4 22-5 34-2" stroke="#E8A27D" strokeLinecap="round" strokeWidth="2.5" />
              <path d="m109 67 5-10 5 10 10 5-10 5-5 10-5-10-10-5 10-5Z" fill="#C5E85B" stroke="#26211E" strokeLinejoin="round" strokeWidth="2" />
            </g>
            <path className="ed-viewer-spark ed-viewer-spark-one" d="m190 43 3-7 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#FF7A45" stroke="#26211E" strokeLinejoin="round" strokeWidth="1.5" />
            <path className="ed-viewer-spark ed-viewer-spark-two" d="m69 54 2-5 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#9A7BEA" stroke="#26211E" strokeLinejoin="round" strokeWidth="1.5" />
            <circle className="ed-viewer-dot ed-viewer-dot-one" cx="203" cy="119" r="4" fill="#C5E85B" stroke="#26211E" strokeWidth="1.5" />
            <circle className="ed-viewer-dot ed-viewer-dot-two" cx="85" cy="44" r="3" fill="#FFCA57" stroke="#26211E" strokeWidth="1.5" />
          </svg>
        </header>

        <section aria-label="Resource document viewer" className="ed-viewer-frame overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_24px_70px_-44px_rgba(26,35,55,0.48)]" data-motion-intro>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
            <div className="flex min-h-10 items-center gap-2 text-sm font-bold text-slate-700">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-50 text-brand">
                <FileText aria-hidden="true" size={16} />
              </span>
              {format === "pdf" ? "PDF document" : "Image document"}
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="hidden text-xs font-medium text-slate-500 sm:inline">In-app reading mode</span>
            </div>
            {!error && (format === "pdf" && document || format !== "pdf" && fileUrl) && (
              <div aria-label="Document controls" className="flex flex-wrap items-center gap-2">
                {format === "pdf" && document && (
                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                    <button
                      aria-label="Previous page"
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-700 transition hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={pageNumber <= 1}
                      onClick={() => setPageNumber((current) => current - 1)}
                      type="button"
                    >
                      <ChevronLeft aria-hidden="true" size={18} />
                    </button>
                    <label className="flex items-center gap-1.5 px-1 text-xs font-semibold text-slate-600">
                      <input
                        aria-label="PDF page number"
                        className="h-8 w-12 rounded-lg border border-slate-200 bg-white text-center text-xs font-bold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-orange-100"
                        max={document.numPages}
                        min="1"
                        onChange={(event) => changePage(event.target.value)}
                        type="number"
                        value={pageNumber}
                      />
                      <span>of {document.numPages}</span>
                    </label>
                    <button
                      aria-label="Next page"
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-700 transition hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={pageNumber >= document.numPages}
                      onClick={() => setPageNumber((current) => current + 1)}
                      type="button"
                    >
                      <ChevronRight aria-hidden="true" size={18} />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    aria-label="Zoom out"
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-700 transition hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
                    disabled={zoom <= minimumZoom}
                    onClick={() => setZoom((current) => Math.max(minimumZoom, current - zoomStep))}
                    type="button"
                  >
                    <ZoomOut aria-hidden="true" size={16} />
                  </button>
                  <span className="min-w-12 text-center text-xs font-bold tabular-nums text-slate-700">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    aria-label="Zoom in"
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-700 transition hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
                    disabled={zoom >= maximumZoom}
                    onClick={() => setZoom((current) => Math.min(maximumZoom, current + zoomStep))}
                    type="button"
                  >
                    <ZoomIn aria-hidden="true" size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {!error && format === "pdf" && document && (
            <div className="ed-viewer-progress flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
              <span className="ed-viewer-progress-mark" aria-hidden="true">
                <BookOpen size={15} />
              </span>
              <div className="min-w-32 flex-1">
                <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  <span>Reading progress</span>
                  <span className="text-slate-700">Page {pageNumber} of {document.numPages}</span>
                </div>
                <div
                  aria-label={`Reading progress: ${readingProgress}%`}
                  aria-valuemax="100"
                  aria-valuemin="0"
                  aria-valuenow={readingProgress}
                  className="ed-viewer-progress-track"
                  role="progressbar"
                >
                  <span style={{ width: `${readingProgress}%` }} />
                </div>
              </div>
              <span className="ed-viewer-progress-percent">{readingProgress}%</span>
              <span className="hidden text-[11px] text-slate-400 sm:inline">
                Use ← → keys to turn pages
              </span>
            </div>
          )}

          {error ? (
            <div className="m-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800 sm:m-6" role="alert">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-rose-600 shadow-sm">
                <FileText aria-hidden="true" size={18} />
              </span>
              <div>
                <h2 className="font-bold">This resource couldn&apos;t be opened</h2>
                <p className="mt-1 leading-6">{error}</p>
              </div>
            </div>
          ) : format === "pdf" ? (
            <div className="ed-viewer-stage max-h-[78vh] overflow-auto bg-[#f3f1ed] p-4 sm:p-8" data-motion-scroll>
              <div className="ed-viewer-page mx-auto w-fit overflow-hidden rounded-sm bg-white shadow-[0_12px_42px_-14px_rgba(15,23,42,0.38)] ring-1 ring-black/5" key={pageNumber}>
                <canvas aria-label={`PDF page ${pageNumber} of ${document?.numPages ?? "…"}`} ref={canvasRef} />
              </div>
            </div>
          ) : (
            <div className="ed-viewer-stage max-h-[78vh] overflow-auto bg-[#f3f1ed] p-4 text-center sm:p-8" data-motion-scroll>
              <img
                alt={title}
                className="ed-viewer-page mx-auto max-w-none origin-top rounded-sm bg-white shadow-[0_12px_42px_-14px_rgba(15,23,42,0.38)] ring-1 ring-black/5 transition-transform"
                onError={() => setError("This image could not be displayed.")}
                onLoad={() => { void recordResourceOpen(); }}
                src={fileUrl}
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
          )}
          {activityError && (
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-rose-100 bg-rose-50 px-4 py-3 text-center text-xs text-rose-700" role="alert">
              <span>{activityError}</span>
              <button
                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 font-bold transition hover:bg-rose-100"
                onClick={() => { void recordResourceOpen(); }}
                type="button"
              >
                Retry
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 bg-white px-4 py-3 text-center text-xs text-slate-500">
            <ShieldCheck aria-hidden="true" className="text-emerald-600" size={15} />
            Secure in-app viewing · Download and print controls are hidden
          </div>
        </section>
        {resourceType === "note" && (
          <AdaptiveTutor noteId={resourceId} resourceType={resourceType} />
        )}
      </section>
    </main>
  );
}
