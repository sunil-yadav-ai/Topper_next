import { VerifyEmailPage } from "../../src/pages/AuthPages.jsx";
import { createPageMetadata } from "../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Verify Your Email | Topper",
  description: "Confirm your Topper account email address.",
  path: "/verify-email",
});

export default async function Page({ searchParams }) {
  const query = await searchParams;
  const token = Array.isArray(query?.token) ? query.token[0] : query?.token ?? "";
  return <VerifyEmailPage token={token} />;
}
