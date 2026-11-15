import { PublicResourcePage } from "../../../src/pages/PublicSeoPages.jsx";
import { createPageMetadata, getPublicSeoData } from "../../../server/seo-metadata.js";
import { siteOrigin } from "../../../server/site-origin.js";

export const dynamic = "force-dynamic";

async function loadResource(params) {
  const { resourceId } = await params;
  return {
    resourceId,
    result: await getPublicSeoData(`/seo/resources/pyq/${encodeURIComponent(resourceId)}`),
  };
}

export async function generateMetadata({ params }) {
  const { resourceId, result } = await loadResource(params);
  const resource = result?.resource;
  return createPageMetadata({
    title: resource?.seoTitle ?? "Published question paper | Topper",
    description: resource?.seoDescription ?? "Find published student question papers on Topper.",
    path: resource?.path ?? `/question-papers/${encodeURIComponent(resourceId)}`,
    index: Boolean(resource),
    keywords: resource?.keywords ?? [],
  });
}

export default async function Page({ params }) {
  const { resourceId, result } = await loadResource(params);
  return (
    <PublicResourcePage
      initialData={result}
      resourceId={resourceId}
      siteOrigin={siteOrigin}
      type="pyq"
    />
  );
}
