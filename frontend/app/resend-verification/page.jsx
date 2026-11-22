import { ResendVerificationPage } from "../../src/components/pages/AuthPages.jsx";
import { createPageMetadata } from "../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Resend Verification Email | Topper",
  description: "Request a new email verification link for your Topper account.",
  path: "/resend-verification",
});

export default function Page() {
  return <ResendVerificationPage />;
}
