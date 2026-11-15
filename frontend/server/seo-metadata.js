import { cache } from "react";
import { siteOrigin } from "./site-origin.js";

export const getPublicSeoData = cache(async function getPublicSeoData(path) {
  const { handleBackendRequest } = await import("./backend-handler.js");
  const request = new Request(new URL(`/api${path}`, siteOrigin));
  const response = await handleBackendRequest(request);
  if (response.status === 404) return null;
  if (!response.ok) {
    const message = await response.text();
    console.error(`SEO data request failed (${response.status}): ${message}`);
    return null;
  }
  return response.json();
});

export function createPageMetadata({
  title,
  description,
  path,
  index = false,
  type = "website",
  keywords = [],
}) {
  const canonical = new URL(path, siteOrigin).href;
  return {
    title,
    description,
    ...(keywords.length ? { keywords } : {}),
    robots: { index, follow: true },
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Topper",
      type,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
