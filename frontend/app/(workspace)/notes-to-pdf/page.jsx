import RouteGuard from "../../../src/components/RouteGuard.jsx";
import NotesToPdfPage from "../../../src/pages/NotesToPdfPage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Notes to PDF | Topper",
  description: "Arrange JPG, JPEG, and PNG study pages into a downloadable PDF on Topper.",
  path: "/notes-to-pdf",
});

export default function Page() {
  return <RouteGuard><NotesToPdfPage /></RouteGuard>;
}
