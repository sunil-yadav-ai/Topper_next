import { RegisterPage } from "../../src/components/pages/AuthPages.jsx";
import { createPageMetadata } from "../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Create a Student Account | Topper",
  description: "Create a free Topper account to share and manage study resources.",
  path: "/register",
});

export default function Page() {
  return <RegisterPage />;
}
