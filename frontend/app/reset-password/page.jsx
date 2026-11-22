import { ResetPasswordPage } from "../../src/components/pages/AuthPages.jsx";
import { createPageMetadata } from "../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Choose a New Password | Topper",
  description: "Set a new password for your Topper account.",
  path: "/reset-password",
});

export default async function Page({ searchParams }) {
  const query = await searchParams;
  const token = Array.isArray(query?.token) ? query.token[0] : query?.token ?? "";
  return <ResetPasswordPage token={token} />;
}
