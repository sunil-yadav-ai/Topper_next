import ScholarshipsPage from "../../../src/components/pages/ScholarshipsPage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Scholarship Finder | Topper",
  description: "Discover, compare and track verified Indian scholarship opportunities.",
  path: "/scholarships",
});

export default function Page() {
  return <ScholarshipsPage />;
}
