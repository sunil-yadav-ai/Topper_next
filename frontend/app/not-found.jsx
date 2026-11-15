import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#fff8eb] px-5 text-center text-[#171717]">
      <section>
        <p className="text-sm font-bold uppercase tracking-widest text-brand">404</p>
        <h1 className="mt-2 text-3xl font-black">Page not found</h1>
        <p className="mt-3 text-slate-600">This page may have moved or is no longer available.</p>
        <Link className="mt-5 inline-block rounded-xl bg-brand px-5 py-3 font-bold text-white" href="/">Return to Topper</Link>
      </section>
    </main>
  );
}
