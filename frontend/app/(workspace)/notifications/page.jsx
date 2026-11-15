import RouteGuard from "../../../src/components/RouteGuard.jsx";
import NotificationsPage from "../../../src/pages/NotificationsPage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Notifications | Topper",
  description: "View your Topper account notifications.",
  path: "/notifications",
});

export default function Page() {
  return <RouteGuard authenticatedOnly><NotificationsPage /></RouteGuard>;
}
