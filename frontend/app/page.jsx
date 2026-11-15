import EduRiseLanding from "../src/components/EduRiseLanding.jsx";
import { JsonLd, organizationSchema } from "../src/lib/seo-schema.jsx";
import { siteOrigin } from "../server/site-origin.js";

export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationSchema(siteOrigin)} />
      <EduRiseLanding />
    </>
  );
}
