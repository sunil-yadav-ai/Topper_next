export default function StudentAvatar({ name = "", avatarUrl = "", size = "large" }) {
  const sizeClass = size === "small" ? "size-10 text-sm" : "size-20 text-2xl";
  const dimension = size === "small" ? 40 : 80;
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return avatarUrl ? (
    <img
      alt={`${name}'s profile`}
      className={`${sizeClass} rounded-full border border-slate-200 bg-slate-100 object-cover`}
      width={dimension}
      height={dimension}
      src={avatarUrl}
    />
  ) : (
    <div
      aria-label={`${name}'s profile picture`}
      className={`${sizeClass} grid shrink-0 place-items-center rounded-full bg-indigo-100 font-bold text-brand`}
      role="img"
    >
      {initials || "S"}
    </div>
  );
}
