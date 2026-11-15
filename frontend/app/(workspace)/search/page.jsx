import ResourceSearchPage from "../../../src/pages/ResourceSearchPage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Search Study Notes and Question Papers | Topper",
  description: "Search published student notes and question papers by subject, topic, university, semester and year on Topper.",
  path: "/search",
});

export default function Page() {
  return <ResourceSearchPage />;
}
