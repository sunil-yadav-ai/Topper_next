import { SubjectDirectoryPage } from "../../src/pages/PublicSeoPages.jsx";
import { createPageMetadata, getPublicSeoData } from "../../server/seo-metadata.js";
import { siteOrigin } from "../../server/site-origin.js";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const result = await getPublicSeoData("/seo/subjects");
  const hasSubjects = Boolean(result?.subjects?.length);
  return createPageMetadata({
    title: "Study Subjects, Notes and Question Papers | Topper",
    description: hasSubjects
      ? `Browse ${result.subjects.length} subjects with published student notes and previous-year question papers on Topper.`
      : "Browse subject areas with published student notes and previous-year question papers on Topper.",
    path: "/subjects",
    index: hasSubjects,
  });
}

export default async function Page() {
  const initialData = await getPublicSeoData("/seo/subjects");
  return <SubjectDirectoryPage initialData={initialData} siteOrigin={siteOrigin} />;
}
