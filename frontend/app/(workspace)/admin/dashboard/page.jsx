import AdminDashboardPage from "../../../../src/pages/AdminDashboardPage.jsx";
import { createPageMetadata } from "../../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Admin Dashboard | Topper",
  description: "Manage Topper community resources and accounts.",
  path: "/admin/dashboard",
});

export default function Page() {
  return <AdminDashboardPage />;
}
