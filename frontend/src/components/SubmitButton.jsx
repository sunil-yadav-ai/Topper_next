export default function SubmitButton({ children, loading, disabled = false, ...props }) {
  return (
    <button
      className="ed-auth-submit inline-flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={loading || disabled}
      type="submit"
      {...props}
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}
