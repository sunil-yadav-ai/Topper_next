"use client";

import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Expand,
  Minimize,
  Minus,
  Plus,
  BookOpen,
  Columns2,
  FileWarning,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Link from "next/link";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import AdaptiveTutor from "./AdaptiveTutor.jsx";

const HTMLFlipBook = dynamic(() => import("react-pageflip"), { ssr: false });
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const minimumZoom = 0.75;
const maximumZoom = 1.75;

function messageFrom(error) {
  return error.response?.data?.message ?? error.message ?? "This note could not be opened.";
}

function findPageContentBounds(canvas) {
  const sampleScale = Math.min(1, 256 / Math.max(canvas.width, canvas.height));
  const sample = document.createElement("canvas");
  sample.width = Math.max(1, Math.ceil(canvas.width * sampleScale));
  sample.height = Math.max(1, Math.ceil(canvas.height * sampleScale));
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not inspect the note page.");
  context.drawImage(canvas, 0, 0, sample.width, sample.height);
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  let left = sample.width;
  let top = sample.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < sample.height; y += 1) {
    for (let x = 0; x < sample.width; x += 1) {
      const offset = (y * sample.width + x) * 4;
      if (pixels[offset] < 247 || pixels[offset + 1] < 247 || pixels[offset + 2] < 247) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) {
    return { x: 0, y: 0, width, height };
  }

  const padding = 2;
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(sample.width - 1, right + padding);
  bottom = Math.min(sample.height - 1, bottom + padding);
  const bounds = {
    x: Math.floor(left / sampleScale),
    y: Math.floor(top / sampleScale),
    width: Math.min(width, Math.ceil((right + 1) / sampleScale)) - Math.floor(left / sampleScale),
    height: Math.min(height, Math.ceil((bottom + 1) / sampleScale)) - Math.floor(top / sampleScale),
  };
  if (bounds.width < width * 0.25 || bounds.height < height * 0.25) {
    return { x: 0, y: 0, width, height };
  }
  return bounds;
}

function PdfNotePage({ pdf, pageNumber, pageCount, pageWidth, pageHeight, zoom, active, onFirstPageReady }) {
  const canvasRef = useRef(null);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    if (!active || !canvasRef.current) return undefined;
    let activeRender = true;
    let renderTask;
    pdf.getPage(pageNumber)
      .then((page) => {
        if (!activeRender || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const sourceCanvas = document.createElement("canvas");
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.max(
          pageWidth / baseViewport.width,
          pageHeight / baseViewport.height,
        ) * zoom;
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        sourceCanvas.width = Math.ceil(viewport.width * pixelRatio);
        sourceCanvas.height = Math.ceil(viewport.height * pixelRatio);
        const sourceContext = sourceCanvas.getContext("2d");
        if (!sourceContext) throw new Error("Your browser could not create a page viewer.");
        sourceContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        renderTask = page.render({ canvas: sourceCanvas, canvasContext: sourceContext, viewport });
        return renderTask.promise.then(() => {
          if (!activeRender || !canvasRef.current) return;
          const crop = findPageContentBounds(sourceCanvas);
          const targetWidth = Math.ceil(pageWidth * zoom);
          const targetHeight = Math.ceil(pageHeight * zoom);
          canvas.width = Math.ceil(targetWidth * pixelRatio);
          canvas.height = Math.ceil(targetHeight * pixelRatio);
          canvas.style.width = `${targetWidth}px`;
          canvas.style.height = `${targetHeight}px`;
          const outputContext = canvas.getContext("2d");
          if (!outputContext) throw new Error("Your browser could not create a page viewer.");
          outputContext.fillStyle = "#fffefa";
          outputContext.fillRect(0, 0, canvas.width, canvas.height);

          const targetRatio = canvas.width / canvas.height;
          const contentRatio = crop.width / crop.height;
          const drawWidth = contentRatio > targetRatio
            ? canvas.width
            : canvas.height * contentRatio;
          const drawHeight = contentRatio > targetRatio
            ? canvas.width / contentRatio
            : canvas.height;
          outputContext.drawImage(
            sourceCanvas,
            crop.x,
            crop.y,
            crop.width,
            crop.height,
            (canvas.width - drawWidth) / 2,
            (canvas.height - drawHeight) / 2,
            drawWidth,
            drawHeight,
          );
          sourceCanvas.width = 0;
          sourceCanvas.height = 0;
          if (activeRender && pageNumber === 1) onFirstPageReady();
        });
      })
      .catch((error) => {
        if (activeRender && error.name !== "RenderingCancelledException") {
          setPageError("This page could not be rendered.");
        }
      });
    return () => {
      activeRender = false;
      renderTask?.cancel();
    };
  }, [active, onFirstPageReady, pageHeight, pageNumber, pageWidth, pdf, zoom]);

  return (
    <div className="note-book-page relative flex h-full w-full items-center justify-center overflow-auto bg-[#fffefa]">
      {active && !pageError ? (
        <canvas
          aria-label={`Note page ${pageNumber} of ${pageCount}`}
          className="max-w-none"
          ref={canvasRef}
        />
      ) : pageError ? (
        <div className="flex flex-col items-center gap-2 px-5 text-center text-sm text-slate-500">
          <FileWarning aria-hidden="true" size={24} />
          <span>{pageError}</span>
        </div>
      ) : (
        <div aria-label={`Loading note page ${pageNumber}`} className="h-full w-full animate-pulse bg-gradient-to-br from-stone-50 via-white to-stone-100" role="status" />
      )}
      <span className="pointer-events-none absolute bottom-3 right-5 text-[11px] font-medium tabular-nums text-stone-400">
        {pageNumber}
      </span>
    </div>
  );
}

function ImageNotePage({ src, title, zoom, onReady, onError }) {
  return (
    <div className="note-book-page relative flex h-full w-full items-center justify-center overflow-auto bg-[#fffefa]">
      <img
        alt={`${title} page 1`}
        className="max-h-full max-w-full object-contain"
        draggable={false}
        onError={onError}
        onLoad={onReady}
        onDragStart={(event) => event.preventDefault()}
        src={src}
        style={{ transform: `scale(${zoom})` }}
      />
      <span className="pointer-events-none absolute bottom-3 right-5 text-[11px] font-medium text-stone-400">1</span>
    </div>
  );
}

const BookPage = forwardRef(function BookPage({ children }, ref) {
  return (
    <div className="note-book-sheet h-full w-full select-none border border-stone-200/80 bg-[#fffefa] shadow-[inset_0_0_16px_rgba(80,60,35,.035)]" ref={ref}>
      {children}
    </div>
  );
});

export default function NoteBookReader({ resourceId }) {
  const rootRef = useRef(null);
  const bookRef = useRef(null);
  const stageRef = useRef(null);
  const pageFlipAudioContextRef = useRef(null);
  const pageFlipAudioBufferRef = useRef(null);
  const recordOpenRef = useRef(false);
  const activityOpenIdRef = useRef("");
  const { user } = useAuth();
  const [title, setTitle] = useState("Study notes");
  const [format, setFormat] = useState("");
  const [pdf, setPdf] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [readyImageResourceId, setReadyImageResourceId] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(360);
  const [stageWidth, setStageWidth] = useState(760);
  const [zoom, setZoom] = useState(1);
  const [singlePage, setSinglePage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [soundError, setSoundError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const recordResourceOpen = useCallback(async () => {
    if (user?.role !== "user" || recordOpenRef.current) return;
    recordOpenRef.current = true;
    if (!activityOpenIdRef.current) activityOpenIdRef.current = crypto.randomUUID();
    setActivityError("");
    try {
      await api.post("/learning-activity/open", {
        resourceType: "note",
        resourceId,
        openId: activityOpenIdRef.current,
      });
    } catch (requestError) {
      recordOpenRef.current = false;
      setActivityError(messageFrom(requestError));
    }
  }, [resourceId, user?.role]);

  useEffect(() => {
    if (readyImageResourceId === resourceId) void recordResourceOpen();
  }, [readyImageResourceId, recordResourceOpen, resourceId]);

  useEffect(() => {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) {
      setSoundError("Page-turn audio is not supported by this browser.");
      setSoundEnabled(false);
      return undefined;
    }

    const context = new AudioContextConstructor();
    let active = true;
    pageFlipAudioContextRef.current = context;
    fetch("/sounds/page-turn.mp3")
      .then((response) => {
        if (!response.ok) throw new Error(`Sound request failed (${response.status}).`);
        return response.arrayBuffer();
      })
      .then((audioData) => context.decodeAudioData(audioData))
      .then((audioBuffer) => {
        if (active) pageFlipAudioBufferRef.current = audioBuffer;
      })
      .catch((audioError) => {
        if (!active) return;
        setSoundError(`Page-turn sound could not be loaded: ${audioError.message}`);
        setSoundEnabled(false);
      });

    return () => {
      active = false;
      pageFlipAudioBufferRef.current = null;
      pageFlipAudioContextRef.current = null;
      void context.close();
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const updateSize = () => {
      const width = stage.clientWidth || window.innerWidth;
      setStageWidth(width);
      const useSinglePage = width < 720 || singlePage;
      const maxPageHeight = Math.min(760, Math.max(300, Math.floor(window.innerHeight * 0.82)));
      const nextWidth = Math.max(
        220,
        Math.min(
          620,
          Math.floor(maxPageHeight / 1.38),
          Math.floor((width - 32) / (useSinglePage ? 1 : 2)),
        ),
      );
      setPageWidth(nextWidth);
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    window.addEventListener("resize", updateSize);
    updateSize();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [loading, singlePage]);

  const useSinglePage = stageWidth < 720 || singlePage;

  useEffect(() => {
    activityOpenIdRef.current = crypto.randomUUID();
    recordOpenRef.current = false;
    let active = true;
    let objectUrl = "";
    let loadingTask;
    setLoading(true);
    setError("");
    setPdf(null);
    setImageUrl("");
    setReadyImageResourceId("");
    setPageCount(0);
    setPageIndex(0);

    async function openNote() {
      try {
        const { data } = await api.get(
          `/search/resources/note/${encodeURIComponent(resourceId)}/view-info`,
        );
        if (!active) return;
        const resource = data.resource;
        setTitle(resource.title || "Study notes");
        setFormat(resource.format || "");
        if (resource.format === "pdf") {
          const resourceUrl = `${api.defaults.baseURL.replace(/\/+$/, "")}/search/resources/note/${encodeURIComponent(resourceId)}/view`;
          const rangeLoadingTask = getDocument({
            url: resourceUrl,
            withCredentials: true,
            rangeChunkSize: 64 * 1024,
            disableAutoFetch: true,
            disableStream: true,
          });
          loadingTask = rangeLoadingTask;
          let loadedPdf;
          try {
            loadedPdf = await rangeLoadingTask.promise;
          } catch (pdfError) {
            if (
              !Number.isInteger(pdfError?.status) ||
              pdfError.status < 500 ||
              pdfError.status > 599
            ) {
              throw pdfError;
            }
            await rangeLoadingTask.destroy();
            const { data: pdfData } = await api.get(resourceUrl, {
              responseType: "arraybuffer",
              timeout: 60_000,
            });
            loadingTask = getDocument({ data: new Uint8Array(pdfData) });
            loadedPdf = await loadingTask.promise;
          }
          if (!active) return;
          setPdf(loadedPdf);
          setPageCount(loadedPdf.numPages);
        } else if (["jpg", "jpeg", "png"].includes(resource.format)) {
          const { data: image } = await api.get(
            `/search/resources/note/${encodeURIComponent(resourceId)}/view`,
            { responseType: "blob" },
          );
          if (!active) return;
          objectUrl = URL.createObjectURL(image);
          setImageUrl(objectUrl);
          setPageCount(1);
        } else {
          throw new Error("The note file format is not supported.");
        }
        setLoading(false);
      } catch (requestError) {
        if (active) {
          setError(messageFrom(requestError));
          setLoading(false);
        }
      }
    }
    void openNote();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      void loadingTask?.destroy();
    };
  }, [resourceId]);

  useEffect(() => {
    function updateFullscreen() {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    }
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    if (!pdf) return undefined;
    function handlePageKey(event) {
      if (
        event.altKey || event.ctrlKey || event.metaKey ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(event.target?.tagName) ||
        event.target?.isContentEditable
      ) return;
      if (event.key === "ArrowLeft") bookRef.current?.pageFlip()?.flipPrev();
      if (event.key === "ArrowRight") bookRef.current?.pageFlip()?.flipNext();
    }
    window.addEventListener("keydown", handlePageKey);
    return () => window.removeEventListener("keydown", handlePageKey);
  }, [pdf]);

  const totalPages = pageCount;
  const displayedPage = totalPages ? Math.min(pageIndex + 1, totalPages) : 0;
  const progress = totalPages ? Math.round((displayedPage / totalPages) * 100) : 0;
  const activePages = useMemo(
    () => new Set([pageIndex - 1, pageIndex, pageIndex + 1, pageIndex + 2]),
    [pageIndex],
  );

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await rootRef.current?.requestFullscreen();
    }
  };

  const handlePageFlip = useCallback((event) => {
    setPageIndex(event.data);
  }, []);

  const unlockPageFlipAudio = useCallback(() => {
    if (!soundEnabled) return;
    const context = pageFlipAudioContextRef.current;
    if (context?.state === "suspended") {
      void context.resume().catch((audioError) => {
        setSoundError(`Page-turn audio could not start: ${audioError.message}`);
      });
    }
  }, [soundEnabled]);

  useEffect(() => {
    const unlockForArrowKeys = (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        unlockPageFlipAudio();
      }
    };
    window.addEventListener("keydown", unlockForArrowKeys, true);
    return () => window.removeEventListener("keydown", unlockForArrowKeys, true);
  }, [unlockPageFlipAudio]);

  const handleFlipState = useCallback((event) => {
    if (!soundEnabled || event.data !== "flipping") return;
    const context = pageFlipAudioContextRef.current;
    const audioBuffer = pageFlipAudioBufferRef.current;
    if (!context || !audioBuffer || context.state !== "running") return;
    const source = context.createBufferSource();
    const volume = context.createGain();
    source.buffer = audioBuffer;
    volume.gain.value = 0.55;
    source.connect(volume);
    volume.connect(context.destination);
    source.start();
  }, [soundEnabled]);

  const handleImageError = () => setError("This note image could not be displayed.");

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-5rem)] bg-[#f7f2e9] px-4 py-8 sm:px-8" aria-busy="true">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 h-8 w-40 animate-pulse rounded-full bg-stone-200" />
          <div className="mx-auto mb-8 h-20 max-w-2xl animate-pulse rounded-2xl bg-stone-200" />
          <div className="mx-auto flex max-w-4xl gap-1 rounded-xl bg-[#ded6c9] p-3 shadow-xl">
            <div className="h-[min(62vh,560px)] flex-1 animate-pulse rounded-l bg-stone-100" />
            <div className="h-[min(62vh,560px)] flex-1 animate-pulse rounded-r bg-stone-50" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-[radial-gradient(ellipse_at_50%_35%,#fffdf7_0%,#f6efe3_68%,#eee4d5_100%)] px-3 py-5 sm:px-6 sm:py-8" onPointerDownCapture={unlockPageFlipAudio} ref={rootRef}>
      <section className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-200 bg-white/80 px-4 text-sm font-bold text-stone-700 shadow-sm hover:border-orange-300 hover:text-orange-700" href="/search">
            <ArrowLeft aria-hidden="true" size={16} /> Explore
          </Link>
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            <BookOpen aria-hidden="true" size={15} /> Digital library
          </span>
          <a className="inline-flex min-h-10 items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-4 text-sm font-bold text-orange-800 shadow-sm hover:bg-orange-50" href="#ai-mcq">
            <Sparkles aria-hidden="true" size={15} /> AI MCQ quiz
          </a>
        </div>

        <header className="mx-auto mb-5 max-w-3xl text-center">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-orange-700">A Topper reading room</p>
          <div className="mx-auto flex max-w-xl items-center gap-4 rounded-2xl border border-[#8b684b] bg-gradient-to-br from-[#4d3a30] to-[#73513a] px-5 py-4 text-left shadow-[0_12px_30px_-16px_rgba(43,30,18,.65)]">
            <span className="grid h-12 w-10 shrink-0 place-items-center rounded-md border border-white/25 bg-white/10 text-amber-100 shadow-inner">
              <BookOpen aria-hidden="true" size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-serif text-xl font-bold tracking-tight text-[#fff8e9] sm:text-2xl" title={title}>{title}</h1>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100/70">{format.toUpperCase()} · {totalPages} {totalPages === 1 ? "page" : "pages"}</p>
            </div>
          </div>
        </header>

        <section aria-label="Interactive note book" className="rounded-[1.5rem] border border-white/80 bg-white/55 p-2 shadow-[0_24px_70px_-35px_rgba(74,54,30,.3)] backdrop-blur-sm sm:p-5" ref={stageRef}>
          <div className="mx-auto flex min-h-[min(68vh,640px)] w-full items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(145deg,#e7ddcd,#d8cbb8)] px-2 py-6 shadow-inner sm:px-4">
            {error ? (
              <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-lg" role="alert">
                <FileWarning aria-hidden="true" className="mx-auto mb-3 text-rose-600" size={28} />
                <h2 className="font-bold text-stone-800">This note couldn&apos;t be opened</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">{error}</p>
              </div>
            ) : totalPages > 0 && (
              <HTMLFlipBook
                autoSize={false}
                className="note-flip-book select-none"
                drawShadow
                flippingTime={850}
                height={Math.round(pageWidth * 1.38)}
                key={`${useSinglePage ? "single" : "double"}-${Math.round(pageWidth / 8)}`}
                maxHeight={900}
                maxShadowOpacity={0.28}
                maxWidth={620}
                minHeight={300}
                minWidth={220}
                mobileScrollSupport
                onFlip={handlePageFlip}
                onChangeState={handleFlipState}
                ref={bookRef}
                showPageCorners
                showCover={false}
                size="fixed"
                startPage={Math.min(pageIndex, totalPages - 1)}
                swipeDistance={30}
                useMouseEvents
                usePortrait={useSinglePage}
                width={pageWidth}
              >
                {Array.from({ length: totalPages }, (_, index) => (
                  <BookPage key={`note-page-${index + 1}`}>
                    {pdf ? (
                      <PdfNotePage
                        active={activePages.has(index)}
                        onFirstPageReady={recordResourceOpen}
                        pageCount={totalPages}
                        pageHeight={Math.round(pageWidth * 1.38)}
                        pageNumber={index + 1}
                        pageWidth={pageWidth}
                        pdf={pdf}
                        zoom={zoom}
                      />
                    ) : (
                      <ImageNotePage
                        onError={handleImageError}
                        onReady={() => setReadyImageResourceId(resourceId)}
                        src={imageUrl}
                        title={title}
                        zoom={zoom}
                      />
                    )}
                  </BookPage>
                ))}
              </HTMLFlipBook>
            )}
          </div>

          {!error && totalPages > 0 && (
            <div className="mx-auto mt-4 max-w-5xl">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white/90 px-3 py-2.5 shadow-sm sm:px-4">
                <div className="flex items-center gap-1">
                  <button aria-label="Previous page" className="grid h-9 w-9 place-items-center rounded-xl text-stone-700 hover:bg-orange-50 disabled:opacity-40" disabled={pageIndex <= 0} onClick={() => bookRef.current?.pageFlip()?.flipPrev()} type="button">
                    <ChevronLeft aria-hidden="true" size={19} />
                  </button>
                  <span className="min-w-[5.5rem] text-center text-xs font-bold tabular-nums text-stone-600">{displayedPage} / {totalPages}</span>
                  <button aria-label="Next page" className="grid h-9 w-9 place-items-center rounded-xl text-stone-700 hover:bg-orange-50 disabled:opacity-40" disabled={pageIndex >= totalPages - 1} onClick={() => bookRef.current?.pageFlip()?.flipNext()} type="button">
                    <ChevronRight aria-hidden="true" size={19} />
                  </button>
                </div>

                <div className="flex flex-1 items-center gap-3 px-1 sm:max-w-sm">
                  <input
                    aria-label="Navigate to page"
                    className="h-1.5 min-w-20 flex-1 cursor-pointer accent-orange-600"
                    max={totalPages - 1}
                    min="0"
                    onChange={(event) => bookRef.current?.pageFlip()?.turnToPage(Number(event.target.value))}
                    type="range"
                    value={pageIndex}
                  />
                  <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-stone-500">{progress}%</span>
                </div>

                <div className="flex items-center gap-1">
                  <button aria-label="Zoom out" className="grid h-9 w-9 place-items-center rounded-xl text-stone-700 hover:bg-orange-50 disabled:opacity-40" disabled={zoom <= minimumZoom} onClick={() => setZoom((current) => Math.max(minimumZoom, current - 0.25))} type="button">
                    <Minus aria-hidden="true" size={17} />
                  </button>
                  <span className="w-11 text-center text-[11px] font-bold tabular-nums text-stone-600">{Math.round(zoom * 100)}%</span>
                  <button aria-label="Zoom in" className="grid h-9 w-9 place-items-center rounded-xl text-stone-700 hover:bg-orange-50 disabled:opacity-40" disabled={zoom >= maximumZoom} onClick={() => setZoom((current) => Math.min(maximumZoom, current + 0.25))} type="button">
                    <Plus aria-hidden="true" size={17} />
                  </button>
                </div>

                <button aria-label={useSinglePage ? "Switch to double-page mode" : "Switch to single-page mode"} className="grid h-9 w-9 place-items-center rounded-xl text-stone-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={stageWidth < 720} onClick={() => setSinglePage((current) => !current)} title={stageWidth < 720 ? "Single-page mode on mobile" : undefined} type="button">
                  <Columns2 aria-hidden="true" size={17} />
                </button>
                <button aria-label={soundEnabled ? "Mute page-turn sound" : "Enable page-turn sound"} className="grid h-9 w-9 place-items-center rounded-xl text-stone-700 hover:bg-orange-50" onClick={() => setSoundEnabled((current) => !current)} type="button">
                  {soundEnabled ? <Volume2 aria-hidden="true" size={17} /> : <VolumeX aria-hidden="true" size={17} />}
                </button>
                <button aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} className="grid h-9 w-9 place-items-center rounded-xl text-stone-700 hover:bg-orange-50" onClick={toggleFullscreen} type="button">
                  {isFullscreen ? <Minimize aria-hidden="true" size={17} /> : <Expand aria-hidden="true" size={17} />}
                </button>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-300/70" role="progressbar" aria-label="Reading progress" aria-valuemax="100" aria-valuemin="0" aria-valuenow={progress}>
                <span className="block h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
              {activityError && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-rose-700" role="alert">
                  <span>{activityError}</span>
                  <button className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 font-bold hover:bg-rose-50" onClick={() => { void recordResourceOpen(); }} type="button">Retry</button>
                </div>
              )}
              {soundError && <p className="mt-2 text-center text-xs text-rose-700" role="alert">{soundError}</p>}
              <p className="mt-2 text-center text-[10px] text-stone-500">Drag a page corner or use ← → keys to turn pages</p>
            </div>
          )}
        </section>
        <div id="ai-mcq">
          <AdaptiveTutor noteId={resourceId} resourceType="note" />
        </div>
      </section>
    </main>
  );
}
