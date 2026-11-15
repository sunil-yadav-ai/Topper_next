import { siteOrigin } from "../server/site-origin.js";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const { handleBackendRequest } = await import("../server/backend-handler.js");
  const request = new Request(new URL("/api/seo-render/sitemap.xml", siteOrigin));
  const response = await handleBackendRequest(request, "/api/seo-render");
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Could not generate the sitemap (${response.status}): ${message}`);
  }

  const xml = await response.text();
  return [...xml.matchAll(/<url>(.*?)<\/url>/g)].map(([, entry]) => {
    const url = entry.match(/<loc>(.*?)<\/loc>/)?.[1];
    if (!url) throw new Error("The sitemap contained an entry without a location.");
    const lastModified = entry.match(/<lastmod>(.*?)<\/lastmod>/)?.[1];
    return {
      url,
      ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
    };
  });
}
