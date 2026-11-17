"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileDown,
  FileText,
  GripVertical,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { PDFDocument, PageSizes } from "pdf-lib";
import { gsap } from "../lib/gsap.js";

gsap.registerPlugin(useGSAP);

const imageFormats = new Map([
  ["jpg", { mimeType: "image/jpeg", format: "jpg" }],
  ["jpeg", { mimeType: "image/jpeg", format: "jpg" }],
  ["png", { mimeType: "image/png", format: "png" }],
]);

export default function NotesToPdfPage() {
  const rootRef = useRef(null);
  const fileInputRef = useRef(null);
  const objectUrlsRef = useRef(new Set());
  const [pages, setPages] = useState([]);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [draggingPage, setDraggingPage] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => () => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (!pdfUrl) return undefined;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const targets = rootRef.current?.querySelectorAll("[data-notes-to-pdf-animate]");
    if (!targets?.length) return;
    gsap.fromTo(
      targets,
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power2.out" },
    );
  }, { scope: rootRef });

  function clearOutput() {
    setPdfUrl("");
    setNotice("");
  }

  function addImages(fileList) {
    const acceptedPages = [];
    const rejectedNames = [];

    for (const file of Array.from(fileList ?? [])) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const imageFormat = imageFormats.get(extension);
      if (!imageFormat || (file.type && file.type !== imageFormat.mimeType)) {
        rejectedNames.push(file.name);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      acceptedPages.push({
        id: crypto.randomUUID(),
        file,
        format: imageFormat.format,
        previewUrl,
      });
    }

    setError(rejectedNames.length
      ? `Skipped unsupported files: ${rejectedNames.join(", ")}. Choose JPG, JPEG, or PNG images.`
      : "");
    if (acceptedPages.length) {
      setPages((current) => [...current, ...acceptedPages]);
      clearOutput();
    }
  }

  function handleFileChange(event) {
    addImages(event.target.files);
    event.target.value = "";
  }

  function handleFileDrop(event) {
    event.preventDefault();
    setUploadDragging(false);
    addImages(event.dataTransfer.files);
  }

  function movePage(fromIndex, toIndex) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= pages.length ||
      toIndex >= pages.length
    ) {
      return;
    }
    setPages((current) => {
      const next = [...current];
      const [movedPage] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedPage);
      return next;
    });
    clearOutput();
  }

  function removePage(pageId) {
    const removedPage = pages.find((page) => page.id === pageId);
    if (removedPage) {
      URL.revokeObjectURL(removedPage.previewUrl);
      objectUrlsRef.current.delete(removedPage.previewUrl);
    }
    setPages((current) => current.filter((page) => page.id !== pageId));
    setError("");
    clearOutput();
  }

  function handlePageDragStart(index, event) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    setDraggingPage(index);
  }

  function handlePageDrop(index, event) {
    event.preventDefault();
    const dragData = event.dataTransfer.getData("text/plain");
    const sourceIndex = Number(dragData);
    if (dragData && Number.isInteger(sourceIndex)) movePage(sourceIndex, index);
    setDraggingPage(null);
    setDropTarget(null);
  }

  async function generatePdf() {
    if (!pages.length || generating) return;
    setGenerating(true);
    setError("");
    setNotice("");
    setPdfUrl("");

    try {
      const document = await PDFDocument.create();
      const pageSize = PageSizes.A4;

      for (const imagePage of pages) {
        const imageBytes = await imagePage.file.arrayBuffer();
        const image = imagePage.format === "png"
          ? await document.embedPng(imageBytes)
          : await document.embedJpg(imageBytes);
        const page = document.addPage(pageSize);
        const scale = Math.min(pageSize[0] / image.width, pageSize[1] / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        page.drawImage(image, {
          x: (pageSize[0] - width) / 2,
          y: (pageSize[1] - height) / 2,
          width,
          height,
        });
      }

      const pdfBytes = await document.save();
      setPdfUrl(URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" })));
      setNotice(`Your ${pages.length}-page PDF is ready to preview or download.`);
    } catch (generationError) {
      setError(generationError.message || "The PDF could not be generated.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="ed-upload-page ed-notes-to-pdf-page" ref={rootRef}>
      <section className="ed-upload-hero" data-notes-to-pdf-animate>
        <div>
          <span className="ed-upload-eyebrow">YOUR STUDY PAGES, TOGETHER</span>
          <h1>Turn images into one PDF.</h1>
          <p>Add your note images and combine them into one downloadable PDF.</p>
        </div>
        <div aria-hidden="true" className="ed-upload-hero-art">
          <FileDown size={42} strokeWidth={1.7} />
        </div>
      </section>

      <ol aria-label="Notes to PDF steps" className="ed-upload-steps" data-notes-to-pdf-animate>
        <li className={pages.length ? "is-complete" : "is-current"}>
          <span>01</span><div><strong>Add images</strong><small>JPG, JPEG, or PNG</small></div>
        </li>
        <li className={pages.length > 1 ? "is-complete" : pages.length ? "is-current" : ""}>
          <span>02</span><div><strong>Arrange pages</strong><small>Drag thumbnails to reorder</small></div>
        </li>
        <li className={pdfUrl ? "is-complete" : pages.length ? "is-current" : ""}>
          <span>03</span><div><strong>Create your PDF</strong><small>Preview and download</small></div>
        </li>
      </ol>

      <div className="ed-upload-layout">
        <section className="ed-upload-card" data-notes-to-pdf-animate>
          <div className="ed-upload-card-heading">
            <div>
              <span className="ed-upload-eyebrow">NOTES WORKSPACE</span>
              <h2>Build your PDF</h2>
            </div>
            <span className="ed-upload-card-icon"><ImagePlus aria-hidden="true" size={21} /></span>
          </div>

          {error && <p className="ed-upload-message ed-upload-error" role="alert">{error}</p>}
          {notice && <p className="ed-upload-message ed-upload-success" role="status">{notice}</p>}

          <div className="ed-upload-form">
            <div className="ed-upload-section-heading">
              <span>01 / ADD YOUR PAGES</span>
              <p>Select multiple images or drop them here. The order you add them is the starting page order.</p>
            </div>
            <label
              className={`ed-upload-file${uploadDragging ? " is-dragging" : ""}${pages.length ? " has-file" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setUploadDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setUploadDragging(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={handleFileDrop}
            >
              <input
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                aria-label="Choose JPG, JPEG, or PNG images"
                disabled={generating}
                multiple
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
              <ImagePlus aria-hidden="true" className="ed-upload-file-art" size={38} />
              <span>Drop images here or choose files</span>
              <small>JPG, JPEG, PNG · each image becomes one PDF page</small>
            </label>
          </div>

          <section className="notes-to-pdf-pages-section">
            <div className="ed-upload-section-heading">
              <span>02 / PAGE ORDER</span>
              <p aria-live="polite">{pages.length} {pages.length === 1 ? "page" : "pages"} in your PDF</p>
            </div>

            {pages.length ? (
              <div aria-label="Uploaded pages. Drag to reorder." className="notes-to-pdf-page-grid" role="list">
                {pages.map((page, index) => (
                  <article
                    aria-label={`Page ${index + 1}: ${page.file.name}`}
                    className={`notes-to-pdf-page-item${draggingPage === index ? " is-dragging" : ""}${dropTarget === index ? " is-drop-target" : ""}`}
                    draggable={!generating}
                    key={page.id}
                    onDragEnd={() => {
                      setDraggingPage(null);
                      setDropTarget(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget(index);
                    }}
                    onDragStart={(event) => handlePageDragStart(index, event)}
                    onDrop={(event) => handlePageDrop(index, event)}
                    role="listitem"
                  >
                    <div className="notes-to-pdf-thumbnail">
                      <img alt={`Preview of ${page.file.name}`} src={page.previewUrl} />
                    </div>
                    <div className="notes-to-pdf-page-details">
                      <span className="notes-to-pdf-page-number">PAGE {index + 1}</span>
                      <span className="notes-to-pdf-page-name" title={page.file.name}>{page.file.name}</span>
                      <div className="notes-to-pdf-page-actions">
                        <span aria-hidden="true" className="notes-to-pdf-drag-handle"><GripVertical size={16} /></span>
                        <button
                          aria-label={`Move page ${index + 1} up`}
                          className="notes-to-pdf-page-action"
                          disabled={generating || index === 0}
                          onClick={() => movePage(index, index - 1)}
                          type="button"
                        >
                          <ArrowUp aria-hidden="true" size={15} />
                        </button>
                        <button
                          aria-label={`Move page ${index + 1} down`}
                          className="notes-to-pdf-page-action"
                          disabled={generating || index === pages.length - 1}
                          onClick={() => movePage(index, index + 1)}
                          type="button"
                        >
                          <ArrowDown aria-hidden="true" size={15} />
                        </button>
                        <button
                          aria-label={`Delete page ${index + 1}`}
                          className="notes-to-pdf-page-action is-delete"
                          disabled={generating}
                          onClick={() => removePage(page.id)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={15} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="notes-to-pdf-empty">
                <FileText aria-hidden="true" size={28} />
                <span>Your page thumbnails will appear here.</span>
              </div>
            )}
          </section>

          <div className="notes-to-pdf-generate">
            <button
              className="ed-upload-submit"
              disabled={!pages.length || generating}
              onClick={generatePdf}
              type="button"
            >
              {generating
                ? <><LoaderCircle aria-hidden="true" className="ed-upload-spinner" size={18} /> Creating PDF…</>
                : <><FileDown aria-hidden="true" size={18} /> Create PDF</>}
            </button>
            {pdfUrl && (
              <a className="notes-to-pdf-download" download="topper-notes.pdf" href={pdfUrl}>
                <Download aria-hidden="true" size={17} /> Download PDF
              </a>
            )}
            {pages.length > 0 && (
              <button
                className="notes-to-pdf-reset"
                disabled={generating}
                onClick={() => {
                  for (const page of pages) {
                    URL.revokeObjectURL(page.previewUrl);
                    objectUrlsRef.current.delete(page.previewUrl);
                  }
                  setPages([]);
                  setError("");
                  clearOutput();
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={15} /> Clear all
              </button>
            )}
          </div>

          {pdfUrl && (
            <section aria-label="PDF preview" className="ed-upload-preview notes-to-pdf-preview">
              <div className="ed-upload-preview-heading">
                <span><FileText aria-hidden="true" size={17} /> PDF preview · {pages.length} pages</span>
              </div>
              <iframe title="Generated notes PDF preview" src={pdfUrl} />
            </section>
          )}
        </section>

        <aside className="ed-upload-aside" data-notes-to-pdf-animate>
          <div className="ed-upload-summary">
            <span className="ed-upload-aside-icon"><FileDown aria-hidden="true" size={20} /></span>
            <span className="ed-upload-eyebrow">DOCUMENT SUMMARY</span>
            <h2>{pages.length ? "Your notes PDF" : "Ready when you are"}</h2>
            <p className="ed-upload-summary-description">Your images will be combined into one PDF.</p>
            <dl>
              <div><dt>Total pages</dt><dd>{pages.length}</dd></div>
              <div><dt>Image formats</dt><dd>JPG · JPEG · PNG</dd></div>
            </dl>
          </div>
          <div className="ed-upload-guidance">
            <h2>Keep every page in order.</h2>
            <p>Arrange the thumbnails if needed, then create and download your PDF.</p>
            <ul>
              <li>One image becomes one page.</li>
              <li>Your images stay in this browser and are not uploaded.</li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
