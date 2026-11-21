import RouteGuard from "../../../../../src/components/RouteGuard.jsx";
import ResourceViewerPage from "../../../../../src/pages/ResourceViewerPage.jsx";
import { PublicResourcePage } from "../../../../../src/pages/PublicSeoPages.jsx";
import { createPageMetadata, getPublicSeoData } from "../../../../../server/seo-metadata.js";
import { siteOrigin } from "../../../../../server/site-origin.js";

export async function generateMetadata({ params }) {
  const { resourceType, resourceId } = await params;
  if (resourceType === "pyq") {
    const initialData = await getPublicSeoData(`/seo/resources/pyq/${encodeURIComponent(resourceId)}`);
    const resource = initialData?.resource;
    return createPageMetadata({
      title: resource?.seoTitle ?? "Previous-year question paper | Topper",
      description: resource?.seoDescription ?? "Find published previous-year question papers on Topper.",
      path: resource?.path ?? `/resources/pyq/${encodeURIComponent(resourceId)}`,
      index: Boolean(resource),
      keywords: resource?.keywords ?? [],
    });
  }
  return createPageMetadata({
    title: "Study resource viewer | Topper",
    description: "View a published study resource on Topper.",
    path: `/resources/${resourceType}/${resourceId}`,
  });
}

export default async function Page({ params }) {
  const { resourceType, resourceId } = await params;
  if (resourceType === "pyq") {
    const initialData = await getPublicSeoData(`/seo/resources/pyq/${encodeURIComponent(resourceId)}`);
    return (
      <PublicResourcePage
        initialData={initialData}
        resourceId={resourceId}
        siteOrigin={siteOrigin}
        type="pyq"
      />
    );
  }
  return (
    <RouteGuard authenticatedOnly>
      <ResourceViewerPage resourceId={resourceId} resourceType={resourceType} />
    </RouteGuard>
  );
}
