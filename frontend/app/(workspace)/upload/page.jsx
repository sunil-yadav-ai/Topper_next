import RouteGuard from "../../../src/components/RouteGuard.jsx";
import UploadPage from "../../../src/components/pages/UploadPage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Upload Study Resources | Topper",
  description: "Share notes and question papers with students on Topper.",
  path: "/upload",
});

export default function Page() {
  return <RouteGuard><UploadPage /></RouteGuard>;
}
