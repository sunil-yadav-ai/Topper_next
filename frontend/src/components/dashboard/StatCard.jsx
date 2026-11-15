export default function StatCard({ label, value, description, tone = "indigo" }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    red: "bg-rose-50 text-rose-700 ring-rose-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    blue: "bg-sky-50 text-sky-700 ring-sky-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  return (
    <article className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.4)] transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{value}</p>
      <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}>
        {description}
      </span>
    </article>
  );
}
