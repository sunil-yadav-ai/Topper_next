"use client";

import Link from "next/link";

export default function ErrorPage({ reset }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#fff8eb] px-5 text-center text-[#171717]">
      <section>
        <p className="text-sm font-bold uppercase tracking-widest text-brand">Something went wrong</p>
        <h1 className="mt-2 text-3xl font-black">This page could not be loaded</h1>
        <p className="mt-3 text-slate-600">Please try again. Your account and saved work have not been changed.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button className="rounded-xl bg-brand px-5 py-3 font-bold text-white" onClick={() => reset()} type="button">Try again</button>
          <Link className="rounded-xl border border-slate-300 px-5 py-3 font-bold" href="/">Return to Topper</Link>
        </div>
      </section>
    </main>
  );
}
