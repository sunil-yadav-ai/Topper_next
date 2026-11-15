import { TopicPage } from "../../../../../src/pages/PublicSeoPages.jsx";
import { createPageMetadata, getPublicSeoData } from "../../../../../server/seo-metadata.js";
import { siteOrigin } from "../../../../../server/site-origin.js";

export const dynamic = "force-dynamic";

async function loadTopic(params) {
  const { slug, topicSlug } = await params;
  return {
    slug,
    topicSlug,
    result: await getPublicSeoData(
      `/seo/subjects/${encodeURIComponent(slug)}/topics/${encodeURIComponent(topicSlug)}`,
    ),
  };
}

export async function generateMetadata({ params }) {
  const { slug, topicSlug, result } = await loadTopic(params);
  const topic = result?.topic;
  return createPageMetadata({
    title: topic
      ? `${topic.topic} Notes | ${topic.subject.subject} | Topper`
      : "Study topic | Topper",
    description: topic
      ? `Browse ${topic.resourceCount} published notes about ${topic.topic} in ${topic.subject.subject}, based on resource details shared on Topper.`
      : "Browse published topic notes and study resources on Topper.",
    path: topic
      ? `/subjects/${topic.subject.slug}/topics/${topic.topicSlug}`
      : `/subjects/${encodeURIComponent(slug)}/topics/${encodeURIComponent(topicSlug)}`,
    index: Boolean(topic),
  });
}

export default async function Page({ params }) {
  const { slug, topicSlug, result } = await loadTopic(params);
  return (
    <TopicPage
      initialData={result}
      siteOrigin={siteOrigin}
      slug={slug}
      topicSlug={topicSlug}
    />
  );
}
