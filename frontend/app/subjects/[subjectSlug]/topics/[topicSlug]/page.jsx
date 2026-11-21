import { TopicPage } from "../../../../../src/pages/PublicSeoPages.jsx";
import { createPageMetadata, getPublicSeoData } from "../../../../../server/seo-metadata.js";
import { siteOrigin } from "../../../../../server/site-origin.js";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { subjectSlug, topicSlug } = await params;
  const initialData = await getPublicSeoData(
    `/seo/subjects/${encodeURIComponent(subjectSlug)}/topics/${encodeURIComponent(topicSlug)}`,
  );
  const topic = initialData?.topic;
  return createPageMetadata({
    title: topic
      ? `${topic.topic} Notes | ${topic.subject.subject} | Topper`
      : "Study Topic | Topper",
    description: topic
      ? `Browse ${topic.resourceCount} published notes about ${topic.topic} in ${topic.subject.subject} on Topper.`
      : "Browse published topic notes and study resources on Topper.",
    path: topic
      ? `/subjects/${topic.subject.slug}/topics/${topic.topicSlug}`
      : `/subjects/${subjectSlug}/topics/${topicSlug}`,
    index: Boolean(topic),
    keywords: topic
      ? [topic.topic, topic.subject.subject, "study notes"]
      : [],
  });
}

export default async function Page({ params }) {
  const { subjectSlug, topicSlug } = await params;
  const initialData = await getPublicSeoData(
    `/seo/subjects/${encodeURIComponent(subjectSlug)}/topics/${encodeURIComponent(topicSlug)}`,
  );
  return (
    <TopicPage
      initialData={initialData}
      slug={subjectSlug}
      topicSlug={topicSlug}
      siteOrigin={siteOrigin}
    />
  );
}
