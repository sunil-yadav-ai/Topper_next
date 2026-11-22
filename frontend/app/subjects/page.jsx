import {
  SubjectDirectoryPage,
} from "../../src/components/pages/PublicSeoPages.jsx";
import { createPageMetadata, getPublicSeoData } from "../../server/seo-metadata.js";
import { siteOrigin } from "../../server/site-origin.js";

export const dynamic = "force-dynamic";

export const metadata = createPageMetadata({
  title: "Study Subjects, Notes and Question Papers | Topper",
  description:
    "Browse published study subjects, notes, topics, and previous-year question papers shared on Topper.",
  path: "/subjects",
  index: true,
  keywords: ["study subjects", "college subjects", "study notes", "question papers"],
});

export default async function Page() {
  const initialData = await getPublicSeoData("/seo/subjects");
  return (
    <SubjectDirectoryPage
      initialData={initialData}
      siteOrigin={siteOrigin}
    />
  );
}
