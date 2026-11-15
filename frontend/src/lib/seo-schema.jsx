const fallbackOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function organizationSchema(origin = fallbackOrigin) {
  const url = new URL("/", origin).href;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${url}#organization`,
      name: "Topper",
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${url}#website`,
      name: "Topper",
      url,
      publisher: { "@id": `${url}#organization` },
    },
  ];
}

export function breadcrumbSchema(items, origin = fallbackOrigin) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: new URL(item.path, origin).href } : {}),
    })),
  };
}

export function JsonLd({ data }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
