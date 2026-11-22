import AdvertisingDisclosurePage from "../../../src/components/pages/AdvertisingDisclosurePage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Advertising and Privacy Information | Topper",
  description: "Learn how advertising works on Topper and review information about privacy, cookies and ad controls.",
  path: "/advertising",
  index: true,
});

export default function Page() {
  return <AdvertisingDisclosurePage />;
}
