import PyqsPage from "../../../src/pages/PyqsPage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";
import { siteOrigin } from "../../../server/site-origin.js";

export const metadata = createPageMetadata({
  title: "Previous-Year Question Papers | Topper",
  description: "Browse published previous-year question papers by subject, semester, university and examination year on Topper.",
  path: "/pyqs",
  index: true,
});

export default function Page() {
  return <PyqsPage siteOrigin={siteOrigin} />;
}
