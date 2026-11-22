import Link from "next/link";
import Panel from "../Panel.jsx";
import TopperLogo from "../TopperLogo.jsx";

export default function AdvertisingDisclosurePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link aria-label="Topper home" className="inline-block" href="/">
          <TopperLogo />
        </Link>
        <Panel className="mt-8 space-y-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand">Transparency</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">Advertising &amp; privacy</h1>
          </div>
          <p className="text-sm leading-6 text-slate-700">
            Topper is free for students. On selected public pages, the platform may display clearly labeled advertisements from Google AdSense. Advertising revenue belongs to the website owner and is separate from the platform-funded contributor reward budget.
          </p>
          <p className="text-sm leading-6 text-slate-700">
            Advertisements do not unlock resources, change academic content, or affect contributor points. Students are never asked to click or view ads, and ad activity is not rewarded.
          </p>
          <p className="text-sm leading-6 text-slate-700">
            When enabled, Google and other third-party vendors may use cookies or similar technologies to serve ads based on a visitor’s prior visits to this site or other sites, and to measure ad performance. Users can manage personalized advertising in{" "}
            <a className="font-semibold text-brand underline" href="https://www.google.com/settings/ads" rel="noreferrer" target="_blank">
              Google Ads Settings
            </a>
            . Learn more in{" "}
            <a className="font-semibold text-brand underline" href="https://policies.google.com/technologies/ads" rel="noreferrer" target="_blank">
              Google’s advertising and privacy information
            </a>
            {" "}and{" "}
            <a className="font-semibold text-brand underline" href="https://www.aboutads.info/choices/" rel="noreferrer" target="_blank">
              industry opt-out information
            </a>.
          </p>
          <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Ad serving must remain disabled until the site owner has published a complete privacy policy and configured any consent mechanism required for the regions served, including a Google-certified CMP where required.
          </p>
          <Link className="inline-block text-sm font-semibold text-brand hover:underline" href="/">Return to Topper</Link>
        </Panel>
      </div>
    </main>
  );
}
