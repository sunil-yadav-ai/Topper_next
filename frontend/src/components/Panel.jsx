export default function Panel({ children, className = "", ...props }) {
  return (
    <section
      className={`ed-card rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_28px_-20px_rgba(15,23,42,0.28)] sm:p-6 ${className}`}
      data-ed-animate
      {...props}
    >
      {children}
    </section>
  );
}
