import Link from "next/link";
import Panel from "../components/Panel.jsx";
import TopperLogo from "../components/TopperLogo.jsx";

const terms = [
  {
    title: "Keep it free and fair",
    description:
      "Topper is for sharing and discovering academic resources. Study resources are free to access; contributor points never unlock resources or paid features.",
  },
  {
    title: "Share responsibly",
    description:
      "Only upload material you created or have permission to share. Do not upload private information, harmful content, or material that violates someone else's rights.",
  },
  {
    title: "Review before relying",
    description:
      "AI-assisted OCR and academic checks can make mistakes. Verification does not replace your own judgment, an instructor's guidance, or checking trusted academic references.",
  },
  {
    title: "Help keep the community useful",
    description:
      "Use reports and corrections constructively. Resources and accounts may be reviewed under platform policies; reporting an issue alone does not deduct contributor points.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fff9ec] px-4 py-8 text-[#171717] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link aria-label="Topper home" className="inline-block" href="/">
          <TopperLogo />
        </Link>
        <Panel className="mt-8 border-[#171717] bg-white shadow-[6px_6px_0_#171717]">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#9270e8]">Learn together. Rise together.</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#171717] sm:text-4xl">Terms &amp; community guidelines</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            These guidelines explain the intended use of Topper in plain language. They are not a substitute for jurisdiction-specific terms reviewed by a qualified legal professional.
          </p>
          <div className="mt-7 space-y-5">
            {terms.map((term, index) => (
              <section className="border-t border-slate-200 pt-4" key={term.title}>
                <h2 className="font-bold text-[#171717]"><span className="mr-2 text-[#ff6b24]">0{index + 1}</span>{term.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{term.description}</p>
              </section>
            ))}
          </div>
          <Link className="mt-7 inline-flex font-bold text-[#5e45bb] hover:underline" href="/">Back to Topper <span aria-hidden="true" className="ml-2">↗</span></Link>
        </Panel>
      </div>
    </main>
  );
}
