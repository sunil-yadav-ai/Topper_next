import RouteGuard from "../../../src/components/RouteGuard.jsx";
import UploadPage from "../../../src/pages/UploadPage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Your Uploads | Topper",
  description: "Manage your shared notes and question papers on Topper.",
  path: "/uploads",
});

export default function Page() {
  return <RouteGuard><UploadPage /></RouteGuard>;
}
