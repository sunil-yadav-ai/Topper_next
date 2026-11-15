"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api.js";
import { usePageMotion } from "../lib/usePageMotion.js";

const sections = [
  ["saved", "Saved resources"],
  ["recent", "Recently accessed"],
  ["uploads", "My uploads"],
];

function messageFromError(error) {
  return error.response?.data?.message ?? error.message ?? "Something went wrong.";
}

export default function LibraryPage() {
  const rootRef = useRef(null);
  const [section, setSection] = useState("saved");
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderFilter, setFolderFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (section === "uploads") {
        const [notesResponse, pyqsResponse] = await Promise.all([
          api.get("/notes"),
          api.get("/pyqs/mine"),
        ]);
        const notes = notesResponse.data.notes.map((note) => ({
          ...note,
          type: "note",
          uploadStatus: note.publicationStatus === "published" ? "Public" : "Private",
        }));
        const pyqs = pyqsResponse.data.pyqs.map((pyq) => ({
          ...pyq,
          type: "pyq",
          uploadStatus: pyq.publicationStatus === "published" ? "Public" : "Private",
        }));
        setItems([...notes, ...pyqs].sort(
          (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
        ));
        setFolders([]);
      } else {
        const { data } = await api.get("/library", { params: { section } });
        setItems(data.items);
        setFolders(data.folders ?? []);
      }
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  async function removeBookmark(item) {
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      await api.delete(`/library/bookmarks/${item.bookmarkId}`);
      setItems((current) => current.filter((entry) => entry.bookmarkId !== item.bookmarkId));
      setNotice("Bookmark removed from your library.");
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setBusyId("");
    }
  }

  async function moveBookmark(item, folder) {
    if (!folder.trim()) return;
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      const { data } = await api.patch(`/library/bookmarks/${item.bookmarkId}`, {
        folder: folder.trim(),
      });
      setItems((current) =>
        current.map((entry) =>
          entry.bookmarkId === item.bookmarkId
            ? { ...entry, folder: data.bookmark.folder }
            : entry,
        ),
      );
      setFolders((current) =>
        [...new Set([...current, data.bookmark.folder])].sort(),
      );
      setNotice(`Saved to “${data.bookmark.folder}”.`);
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setBusyId("");
    }
  }

  const filteredItems =
    section === "saved" && folderFilter
      ? items.filter((item) => item.folder === folderFilter)
      : items;

  usePageMotion(rootRef, { dependencies: [section, loading, filteredItems.length] });

  return (
    <main className="ed-library-page min-h-screen bg-slate-50" ref={rootRef}>
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink via-[#253372] to-indigo-700 px-5 py-7 text-white shadow-[0_24px_70px_-35px_rgba(30,41,59,0.6)] sm:px-8 sm:py-9" data-motion-intro>
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border-[34px] border-white/[0.06]" />
          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">Your free study collection</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Student library</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-indigo-100/85 sm:text-base">Your saved notes and PYQs, recently opened resources, and your uploads. All resources are free to view.</p>
          </div>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[230px_1fr]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:sticky lg:top-5" data-motion-intro>
            <nav aria-label="Library sections" className="flex gap-1 overflow-x-auto lg:flex-col">
              {sections.map(([key, title]) => (
                <button
                  aria-current={section === key ? "page" : undefined}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold ${
                    section === key
                      ? "bg-indigo-50 text-brand shadow-sm"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                  key={key}
                  onClick={() => {
                    setSection(key);
                    setFolderFilter("");
                  }}
                  type="button"
                >
                  {title}
                </button>
              ))}
            </nav>
          </aside>

          <section aria-label={sections.find(([key]) => key === section)?.[1]}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3" data-motion-intro>
              <div>
                <h2 className="text-xl font-bold text-ink">{sections.find(([key]) => key === section)?.[1]}</h2>
                <p className="mt-1 text-sm text-slate-500">{filteredItems.length} resource{filteredItems.length === 1 ? "" : "s"}</p>
              </div>
              {section === "saved" && folders.length > 0 && (
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  Folder
                  <select
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                    onChange={(event) => setFolderFilter(event.target.value)}
                    value={folderFilter}
                  >
                    <option value="">All folders</option>
                    {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                  </select>
                </label>
              )}
            </div>
            {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}
            {notice && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{notice}</p>}
            {loading ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">Loading your library…</p>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center" data-motion-scroll>
                <h3 className="font-bold text-ink">Nothing here yet</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {section === "saved"
                    ? "Save notes and PYQs from Explore."
                    : section === "uploads"
                      ? "Resources you upload are public immediately and listed here."
                      : "Open a note or PYQ to see it in this list."}
                </p>
                <Link className="mt-4 inline-block rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white" href={section === "uploads" ? "/upload" : "/search"}>
                  {section === "uploads" ? "Upload a resource" : "Find free resources"}
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => (
                  <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.4)] transition hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-md" data-motion-stagger key={item.bookmarkId ?? `${item.type}-${item.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold uppercase text-brand">{item.type === "note" ? "Notes" : "PYQ"} · Free</span>
                      {section === "saved" && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{item.folder}</span>}
                      {section === "uploads" && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{item.uploadStatus}</span>}
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-ink">{item.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.description}</p>
                    <p className="mt-3 text-xs text-slate-500">{item.subject} · Semester {item.semester}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {section === "uploads"
                        ? `Uploaded ${new Date(item.createdAt).toLocaleDateString()}`
                        : section === "recent" && item.lastAccessedAt
                          ? `Opened ${new Date(item.lastAccessedAt).toLocaleString()}`
                          : `Saved ${new Date(item.savedAt).toLocaleDateString()}`}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-2 pt-5">
                      <Link className="flex-1 rounded-xl bg-brand px-3 py-2.5 text-center text-sm font-bold text-white hover:bg-indigo-700" href={`/resources/${item.type}/${item.id}`}>View Resource</Link>
                      {section === "saved" && (
                        <>
                          <select
                            aria-label={`Move ${item.title} to folder`}
                            className="max-w-32 rounded-xl border border-slate-200 px-2 text-xs"
                            disabled={busyId === item.id}
                            onChange={(event) => {
                              if (event.target.value === "__new__") {
                                const folder = window.prompt("Enter a folder name");
                                if (folder) moveBookmark(item, folder);
                              } else if (event.target.value) {
                                moveBookmark(item, event.target.value);
                              }
                            }}
                            value=""
                          >
                            <option value="" disabled>Organize</option>
                            {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                            <option value="__new__">New folder…</option>
                          </select>
                          <button
                            className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                            disabled={busyId === item.id}
                            onClick={() => removeBookmark(item)}
                            type="button"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
