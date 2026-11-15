import { SubjectPage } from "../../../src/pages/PublicSeoPages.jsx";
import { createPageMetadata, getPublicSeoData } from "../../../server/seo-metadata.js";
import { siteOrigin } from "../../../server/site-origin.js";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const result = await getPublicSeoData(`/seo/subjects/${encodeURIComponent(slug)}`);
  const subject = result?.subject;
  return createPageMetadata({
    title: subject
      ? `${subject.subject} Notes, Topics and Question Papers | Topper`
      : "Study subject | Topper",
    description: subject
      ? `Browse ${subject.resourceCount} published study resources for ${subject.subject}, including notes and previous-year question papers shared on Topper.`
      : "Browse published notes and question papers by subject on Topper.",
    path: subject ? `/subjects/${subject.slug}` : `/subjects/${encodeURIComponent(slug)}`,
    index: Boolean(subject),
  });
}

export default async function Page({ params }) {
  const { slug } = await params;
  const initialData = await getPublicSeoData(`/seo/subjects/${encodeURIComponent(slug)}`);
  return <SubjectPage initialData={initialData} siteOrigin={siteOrigin} slug={slug} />;
}
