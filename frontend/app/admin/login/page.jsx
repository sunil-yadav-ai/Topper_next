import { LoginPage } from "../../../src/pages/AuthPages.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Admin Sign In | Topper",
  description: "Sign in to the Topper administration dashboard.",
  path: "/admin/login",
});

export default function Page() {
  return <LoginPage admin />;
}
