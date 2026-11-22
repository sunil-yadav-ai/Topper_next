import { SubjectPage } from "../../../src/components/pages/PublicSeoPages.jsx";
import { createPageMetadata, getPublicSeoData } from "../../../server/seo-metadata.js";
import { siteOrigin } from "../../../server/site-origin.js";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { subjectSlug } = await params;
  const initialData = await getPublicSeoData(`/seo/subjects/${encodeURIComponent(subjectSlug)}`);
  const subject = initialData?.subject;
  return createPageMetadata({
    title: subject
      ? `${subject.subject} Notes, Topics and Question Papers | Topper`
      : "Study Subject | Topper",
    description: subject
      ? `Browse ${subject.resourceCount} published ${subject.subject} resources, notes, topics, and question papers on Topper.`
      : "Browse published study resources by subject on Topper.",
    path: subject ? `/subjects/${subject.slug}` : `/subjects/${subjectSlug}`,
    index: Boolean(subject),
    keywords: subject
      ? [subject.subject, "study notes", "question papers", ...subject.topics.map((topic) => topic.topic)]
      : [],
  });
}

export default async function Page({ params }) {
  const { subjectSlug } = await params;
  const initialData = await getPublicSeoData(`/seo/subjects/${encodeURIComponent(subjectSlug)}`);
  return (
    <SubjectPage
      initialData={initialData}
      slug={subjectSlug}
      siteOrigin={siteOrigin}
    />
  );
}
