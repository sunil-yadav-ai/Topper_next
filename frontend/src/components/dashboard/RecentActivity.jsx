function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function RecentActivity({ items }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Recent activity</h2>
        <p className="mt-1 text-sm text-slate-500">Updates from your account and contributions</p>
      </div>
      {items.length ? (
        <ol className="mt-5 space-y-4">
          {items.map((item) => (
            <li className="flex gap-3" key={item.id}>
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">{item.description}</p>
                <time className="mt-1 block text-xs text-slate-400" dateTime={item.createdAt}>
                  {formatDate(item.createdAt)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No activity to show yet.
        </p>
      )}
    </section>
  );
}
