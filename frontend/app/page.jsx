import EduRiseLanding from "../src/components/EduRiseLanding.jsx";
import { JsonLd, organizationSchema, breadcrumbSchema } from "../src/lib/seo-schema.jsx";
import { siteOrigin } from "../server/site-origin.js";
import { createPageMetadata } from "../server/seo-metadata.js";

export const metadata = createPageMetadata({
  title: "Topper - Free Study Notes, PYQ Papers and Learning Resources",
  description:
    "Find free study notes, previous-year question papers, subject resources, and academic learning material shared by students on Topper.",
  path: "/",
  index: true,
  keywords: [
    "study notes",
    "previous year question papers",
    "PYQ",
    "college study material",
    "student learning",
    "syllabus",
  ],
});

export default function HomePage() {
  const websiteSchema = organizationSchema(siteOrigin).find(
    (schema) => schema["@type"] === "WebSite",
  );
  const searchActionSchema = {
    ...websiteSchema,
    potentialAction: {
      "@type": "SearchAction",
      target: `${new URL("/", siteOrigin).href}search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  return (
    <>
      <JsonLd
        data={[
          ...organizationSchema(siteOrigin).filter(
            (schema) => schema["@type"] !== "WebSite",
          ),
          searchActionSchema,
          breadcrumbSchema([{ name: "Home", path: "/" }], siteOrigin),
        ]}
      />
      <EduRiseLanding />
    </>
  );
}
