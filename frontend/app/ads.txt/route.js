export const dynamic = "force-dynamic";

export function GET() {
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? "";
  const adsEnabled = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true";
  const consentReady =
    process.env.NEXT_PUBLIC_ADSENSE_CONSENT_READY === "true";

  if (
    !adsEnabled ||
    !consentReady ||
    !/^ca-pub-\d+$/.test(publisherId)
  ) {
    return new Response(null, { status: 404 });
  }

  const publisherNumber = publisherId.slice("ca-pub-".length);
  return new Response(
    `google.com, pub-${publisherNumber}, DIRECT, f08c47fec0942fa0\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
