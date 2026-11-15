export default function FormField({
  label,
  name,
  type = "text",
  autoComplete,
  ...props
}) {
  return (
    <label className="block" htmlFor={name}>
      <span className="ed-auth-field-label mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      <input
        className="ed-auth-input w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-900/[0.02] outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10"
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        {...props}
      />
    </label>
  );
}
