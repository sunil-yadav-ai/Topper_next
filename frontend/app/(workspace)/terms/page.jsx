import TermsPage from "../../../src/pages/TermsPage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Terms and Community Guidelines | Topper",
  description: "Read Topper's community guidelines for sharing and discovering student academic resources.",
  path: "/terms",
  index: true,
});

export default function Page() {
  return <TermsPage />;
}
