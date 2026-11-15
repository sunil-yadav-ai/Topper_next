import RouteGuard from "../../../src/components/RouteGuard.jsx";
import LibraryPage from "../../../src/pages/LibraryPage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "My Library | Topper",
  description: "View your saved study resources on Topper.",
  path: "/library",
});

export default function Page() {
  return <RouteGuard><LibraryPage /></RouteGuard>;
}
