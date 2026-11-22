import { ForgotPasswordPage } from "../../src/components/pages/AuthPages.jsx";
import { createPageMetadata } from "../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Reset Your Password | Topper",
  description: "Request instructions to reset your Topper account password.",
  path: "/forgot-password",
});

export default function Page() {
  return <ForgotPasswordPage />;
}
