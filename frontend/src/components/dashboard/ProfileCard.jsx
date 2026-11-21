import StudentAvatar from "./StudentAvatar.jsx";

function ProfileDetail({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-700">{value || "—"}</dd>
    </div>
  );
}

export default function ProfileCard({ profile, onEdit }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-white to-indigo-50/80 p-5 shadow-[0_20px_50px_-36px_rgba(30,41,59,0.3)] sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-56 rounded-full bg-indigo-100/50 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <StudentAvatar name={profile.fullName} avatarUrl={profile.avatarUrl} />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Student profile</p>
            <h2 className="mt-1 break-words text-xl font-bold tracking-tight text-ink sm:text-2xl">{profile.fullName}</h2>
            <p className="mt-1 break-all text-sm text-slate-500">{profile.email}</p>
          </div>
        </div>
        <button
          className="rounded-xl border border-indigo-100 bg-white/80 px-3.5 py-2 text-sm font-semibold text-brand shadow-sm hover:border-indigo-300 hover:bg-indigo-50"
          onClick={onEdit}
          type="button"
        >
          Edit profile
        </button>
      </div>
      <dl className="relative mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-indigo-100/80 pt-5 sm:grid-cols-4">
        <ProfileDetail label="University" value={profile.university} />
        <ProfileDetail label="Department" value={profile.department} />
        <ProfileDetail label="Batch / semester" value={`${profile.batch} · Semester ${profile.semester}`} />
      </dl>
    </section>
  );
}
