"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Panel from "../Panel.jsx";
import { api } from "../../lib/api.js";
import { usePageMotion } from "../../lib/usePageMotion.js";
import AnimatedIllustration from "../AnimatedIllustration.jsx";

function messageFrom(error) {
  return error.response?.data?.message ?? error.message ?? "Could not load notification history.";
}

export default function NotificationsPage() {
  const rootRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function loadHistory(nextPage = page) {
    setError("");
    try {
      const { data } = await api.get("/notifications", {
        params: { page: nextPage, limit: 25 },
      });
      setNotifications(data.notifications);
      setPagination(data.pagination);
      setUnreadCount(data.unreadCount);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory(page);
  }, [page]);

  usePageMotion(rootRef, { dependencies: [loading, notifications.length, page] });

  async function markRead(notification) {
    if (notification.isRead) return;
    setBusy(notification.id);
    setError("");
    try {
      await api.patch(`/notifications/${notification.id}/read`);
      setNotifications((current) => current.map((item) =>
        item.id === notification.id ? { ...item, isRead: true } : item,
      ));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy("");
    }
  }

  async function markAllRead() {
    if (!unreadCount) return;
    setBusy("all");
    setError("");
    try {
      await api.patch("/notifications/read-all");
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy("");
    }
  }

  async function deleteNotification(notification) {
    setBusy(notification.id);
    setError("");
    try {
      await api.delete(`/notifications/${notification.id}`);
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
      if (!notification.isRead) setUnreadCount((count) => Math.max(0, count - 1));
      if (notifications.length === 1 && page > 1) setPage((current) => current - 1);
      else await loadHistory(page);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50" ref={rootRef}>
      <section className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-8 sm:py-10">
        <div className="relative flex flex-wrap items-end justify-between gap-3 overflow-hidden rounded-3xl bg-gradient-to-br from-ink via-[#253372] to-indigo-700 px-5 py-6 text-white shadow-[0_24px_70px_-35px_rgba(30,41,59,0.6)] sm:px-7 sm:py-8" data-motion-intro>
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-20 size-52 rounded-full border-[28px] border-white/[0.06]" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">Your updates</p>
            <div className="flex items-center gap-2">
              <AnimatedIllustration className="ed-notification-art" variant="notification" size={34} />
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Notification history</h1>
            </div>
            <p className="mt-2 text-sm text-indigo-100/85">{unreadCount} unread notification{unreadCount === 1 ? "" : "s"}.</p>
          </div>
          <button
            className="relative rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-50"
            disabled={!unreadCount || Boolean(busy)}
            onClick={markAllRead}
            type="button"
          >
            Mark all as read
          </button>
        </div>
        {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}</p>}
        {loading ? (
          <Panel><p className="text-sm text-slate-600">Loading notification history…</p></Panel>
        ) : notifications.length ? (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Panel className={`transition-shadow hover:shadow-md ${notification.isRead ? "" : "border-indigo-200 bg-indigo-50/40"}`} data-motion-stagger key={notification.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!notification.isRead && <span className="size-2 rounded-full bg-brand" />}
                      <h2 className="font-bold text-ink">{notification.title}</h2>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notification.message}</p>
                    <time className="mt-2 block text-xs text-slate-500" dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString()}</time>
                    {notification.link && <Link className="mt-2 inline-block text-sm font-semibold text-brand hover:underline" onClick={() => markRead(notification)} href={notification.link}>Open related page</Link>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-3">
                    {!notification.isRead && (
                      <button className="text-sm font-semibold text-brand disabled:opacity-50" disabled={busy === notification.id} onClick={() => markRead(notification)} type="button">Mark read</button>
                    )}
                    <button className="text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={busy === notification.id} onClick={() => deleteNotification(notification)} type="button">Delete</button>
                  </div>
                </div>
              </Panel>
            ))}
            {pagination?.pages > 1 && (
              <div className="flex items-center justify-center gap-3 py-3">
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button">Previous</button>
                <span className="text-sm text-slate-500">Page {pagination.page} of {pagination.pages}</span>
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={page >= pagination.pages} onClick={() => setPage((current) => current + 1)} type="button">Next</button>
              </div>
            )}
          </div>
        ) : (
          <Panel><p className="text-center text-sm text-slate-600">No notifications yet. New updates will appear here.</p></Panel>
        )}
      </section>
    </main>
  );
}
