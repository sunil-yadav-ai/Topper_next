import RouteGuard from "../../../src/components/RouteGuard.jsx";
import AiPracticePage from "../../../src/pages/AiPracticePage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "AI Practice | Topper",
  description: "Practice academic topics with Topper's AI learning tools.",
  path: "/practice",
});

export default function Page() {
  return <RouteGuard><AiPracticePage /></RouteGuard>;
}
