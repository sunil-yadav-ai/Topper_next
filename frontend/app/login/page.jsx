import { LoginPage } from "../../src/pages/AuthPages.jsx";
import { createPageMetadata } from "../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Student Sign In | Topper",
  description: "Sign in to your Topper student account.",
  path: "/login",
});

export default function Page() {
  return <LoginPage />;
}
