import RouteGuard from "../../../../../src/components/RouteGuard.jsx";
import ResourceViewerPage from "../../../../../src/pages/ResourceViewerPage.jsx";
import { createPageMetadata } from "../../../../../server/seo-metadata.js";

export async function generateMetadata({ params }) {
  const { resourceType, resourceId } = await params;
  return createPageMetadata({
    title: "Study resource viewer | Topper",
    description: "View a published study resource on Topper.",
    path: `/resources/${resourceType}/${resourceId}`,
  });
}

export default async function Page({ params }) {
  const { resourceType, resourceId } = await params;
  return (
    <RouteGuard authenticatedOnly>
      <ResourceViewerPage resourceId={resourceId} resourceType={resourceType} />
    </RouteGuard>
  );
}
