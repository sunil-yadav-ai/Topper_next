import ScholarshipDetailsPage from "../../../../src/components/pages/ScholarshipDetailsPage.jsx";
import { createPageMetadata } from "../../../../server/seo-metadata.js";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return createPageMetadata({
    title: "Scholarship Details | Topper",
    description: "Review scholarship eligibility, benefits and official application information.",
    path: `/scholarships/${slug}`,
  });
}

export default async function Page({ params }) {
  const { slug } = await params;
  return <ScholarshipDetailsPage slug={slug} />;
}
