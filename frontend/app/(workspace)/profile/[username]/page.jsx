import ProfilePage from "../../../../src/pages/ProfilePage.jsx";
import { createPageMetadata } from "../../../../server/seo-metadata.js";

export async function generateMetadata({ params }) {
  const { username } = await params;
  return createPageMetadata({
    title: "Student Profile | Topper",
    description: "View a student's public profile and shared resources on Topper.",
    path: `/profile/${encodeURIComponent(username)}`,
  });
}

export default async function Page({ params }) {
  const { username } = await params;
  return <ProfilePage username={username} />;
}
