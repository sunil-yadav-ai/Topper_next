function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export default function SavedResources({ resources }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Saved resources</h2>
          <p className="mt-1 text-sm text-slate-500">Resources you’ve saved</p>
        </div>
        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-brand">
          {resources.length}
        </span>
      </div>
      {resources.length ? (
        <ul className="mt-5 divide-y divide-slate-100">
          {resources.map((resource) => (
            <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0" key={resource.id}>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-800">{resource.title}</p>
                <p className="mt-1 text-xs capitalize text-slate-500">
                  {resource.type === "pyq" ? "Past question paper" : resource.type} · by {resource.uploadedBy}
                </p>
              </div>
              <time className="shrink-0 text-xs text-slate-400" dateTime={resource.createdAt}>
                {formatDate(resource.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          You haven’t saved any resources yet.
        </p>
      )}
    </section>
  );
}
