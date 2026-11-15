import RouteGuard from "../../../src/components/RouteGuard.jsx";
import SyllabusAnalysisPage from "../../../src/pages/SyllabusAnalysisPage.jsx";
import { createPageMetadata } from "../../../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Syllabus Analyzer | Topper",
  description: "Analyze a syllabus and explore related learning resources on Topper.",
  path: "/syllabus",
});

export default function Page() {
  return <RouteGuard><SyllabusAnalysisPage /></RouteGuard>;
}
