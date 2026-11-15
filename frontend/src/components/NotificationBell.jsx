import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { api } from "../lib/api.js";

function messageFrom(error) {
  return error.response?.data?.message ?? error.message ?? "Could not load notifications.";
}

function shortTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function loadNotifications() {
    try {
      const { data } = await api.get("/notifications", {
        params: { limit: 8, page: 1 },
      });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setError("");
    } catch (requestError) {
      setError(messageFrom(requestError));
    }
  }

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(timer);
  }, []);

  async function markRead(notification) {
    if (notification.isRead || busy) return;
    setBusy(notification.id);
    setError("");
    try {
      await api.patch(`/notifications/${notification.id}/read`);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy("");
    }
  }

  async function deleteNotification(notificationId) {
    setBusy(notificationId);
    setError("");
    try {
      const notification = notifications.find((item) => item.id === notificationId);
      await api.delete(`/notifications/${notificationId}`);
      setNotifications((current) => current.filter((item) => item.id !== notificationId));
      if (notification && !notification.isRead) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setBusy("");
    }
  }

  async function markAllRead() {
    if (!unreadCount || busy) return;
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

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        className="relative grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-brand"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bell aria-hidden="true" className="size-5" strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-5 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          aria-label="Recent notifications"
          className="absolute right-0 z-50 mt-2 w-[min(92vw,24rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)]"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="font-bold text-ink">Notifications</h2>
              <p className="text-xs text-slate-500">{unreadCount} unread</p>
            </div>
            <button
              className="text-xs font-semibold text-brand disabled:opacity-50"
              disabled={!unreadCount || Boolean(busy)}
              onClick={markAllRead}
              type="button"
            >
              Mark all read
            </button>
          </div>
          {error && <p className="px-4 py-2 text-xs text-rose-700" role="alert">{error}</p>}
          <div className="max-h-[min(65vh,28rem)] overflow-y-auto">
            {notifications.length ? notifications.map((notification) => (
              <article
                className={`border-b border-slate-100 px-4 py-3 last:border-0 ${notification.isRead ? "" : "bg-indigo-50/60"}`}
                key={notification.id}
              >
                <div className="flex items-start gap-2">
                  {!notification.isRead && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />}
                  <div className="min-w-0 flex-1">
                    <Link
                      className="block text-left"
                      onClick={() => markRead(notification)}
                      href={notification.link || "/notifications"}
                    >
                      <p className="text-sm font-bold text-ink">{notification.title}</p>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{notification.message}</p>
                      <time className="mt-1 block text-[10px] text-slate-400" dateTime={notification.createdAt}>{shortTime(notification.createdAt)}</time>
                    </Link>
                    <div className="mt-2 flex gap-3">
                      {!notification.isRead && (
                        <button
                          className="text-xs font-semibold text-brand disabled:opacity-50"
                          disabled={busy === notification.id}
                          onClick={() => markRead(notification)}
                          type="button"
                        >
                          Mark as read
                        </button>
                      )}
                      <button
                        className="text-xs font-semibold text-slate-500 hover:text-rose-700 disabled:opacity-50"
                        disabled={busy === notification.id}
                        onClick={() => deleteNotification(notification.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )) : (
              <p className="px-4 py-8 text-center text-sm text-slate-500">You’re all caught up. New updates will appear here.</p>
            )}
          </div>
          <Link
            className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-bold text-brand hover:bg-slate-50"
            onClick={() => setOpen(false)}
            href="/notifications"
          >
            View notification history
          </Link>
        </section>
      )}
    </div>
  );
}
