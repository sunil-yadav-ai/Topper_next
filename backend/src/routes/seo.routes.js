import { Router } from "../lib/router.js";
import {
  buildSitemapEntries,
  getPublicResourcePage,
  getSiteOrigin,
  getSubjectDirectoryPage,
  getSubjectPage,
  getTopicPage,
  metaDescription,
} from "../services/seo.service.js";

const seoRouter = Router();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function jsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function makeBreadcrumbs(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };
}

function renderPage({
  title,
  description,
  canonical,
  body,
  structuredData = [],
  robots = "index,follow",
  keywords = [],
}) {
  const jsonLd = jsonForHtml(structuredData);
  const keywordsContent = [...new Set(keywords.filter(Boolean).map(String).map((value) => value.trim()).filter(Boolean))]
    .slice(0, 12)
    .join(", ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="${escapeHtml(robots)}">
    <meta name="description" content="${escapeHtml(metaDescription(description))}">
    ${keywordsContent ? `<meta name="keywords" content="${escapeHtml(keywordsContent)}">` : ""}
    <meta name="theme-color" content="#fff8eb">
    <link rel="icon" type="image/svg+xml" href="/topper-icon.svg">
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ""}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Topper">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : ""}
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <title>${escapeHtml(title)}</title>
    <script type="application/ld+json">${jsonLd}</script>
    <style>
      :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#171717;background:#fff8eb;font-synthesis:none;text-rendering:optimizeLegibility}
      *{box-sizing:border-box}body{margin:0;min-width:320px;background:radial-gradient(ellipse at 86% 8%,rgba(200,239,22,.12),transparent 30rem),#fff8eb}
      a{color:#5e45bb;text-decoration-thickness:1px;text-underline-offset:3px}a:hover{text-decoration-thickness:2px}
      header,main,footer{width:min(100% - 32px,880px);margin-inline:auto}header{padding:24px 0;border-bottom:1px solid rgba(23,23,23,.18)}
      .brand{color:#171717;font-size:1.35rem;font-weight:900;text-decoration:none}.brand-mark{color:#ff641f}
      main{padding-block:24px 56px}.breadcrumbs{font-size:.875rem;line-height:1.6}.breadcrumbs ol{display:flex;flex-wrap:wrap;gap:.45rem;list-style:none;padding:0;margin:0 0 24px}.breadcrumbs li+li:before{content:"/";color:#766f65;margin-right:.45rem}
      h1{font-size:clamp(2rem,7vw,3.2rem);line-height:1.08;letter-spacing:-.04em;margin:.2rem 0 1rem;overflow-wrap:anywhere}
      h2{font-size:1.35rem;line-height:1.25;margin:2rem 0 .75rem}p{line-height:1.7;color:#504b44}.lead{font-size:1.08rem;max-width:70ch}
      .card{background:#fff;border:1px solid rgba(23,23,23,.16);border-radius:14px;padding:18px;margin-block:16px;box-shadow:4px 4px 0 rgba(23,23,23,.85)}
      dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:14px;margin:0}dt{font-size:.75rem;color:#615a4f}dd{font-weight:650;margin:4px 0 0;overflow-wrap:anywhere}
      ul{padding-left:1.2rem}li{margin:.5rem 0;line-height:1.6}.resource-title{font-weight:750}.muted{font-size:.86rem;color:#615a4f}
      footer{border-top:1px solid rgba(23,23,23,.18);padding:20px 0 28px;font-size:.9rem}
      @media(max-width:520px){header,main,footer{width:min(100% - 24px,880px)}.card{padding:14px}main{padding-top:18px}}
    </style>
  </head>
  <body>
    <header><a class="brand" href="/">Top<span class="brand-mark">per</span></a></header>
    <main>${body}</main>
    <footer><a href="/">Topper home</a></footer>
  </body>
</html>`;
}

function renderBreadcrumbs(items) {
  const visible = items.map((item) => (
    `<li>${item.url ? `<a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a>` : escapeHtml(item.name)}</li>`
  )).join("");
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${visible}</ol></nav>`;
}

function renderResourceList(resources) {
  if (!resources.length) return "<p>No other published resources are listed yet.</p>";
  return `<ul>${resources.map((resource) => (
    `<li><a class="resource-title" href="${escapeHtml(resource.path)}">${escapeHtml(resource.title)}</a><div class="muted">${escapeHtml([resource.type === "note" ? "Notes" : "Question paper", resource.subject, resource.university, resource.examinationYear].filter(Boolean).join(" · "))}</div></li>`
  )).join("")}</ul>`;
}

function renderResourceBody(data, siteOrigin) {
  const { resource, relatedResources } = data;
  const subjectPath = resource.subjectPath;
  const bread = [
    { name: "Home", url: new URL("/", siteOrigin).href },
    ...(subjectPath
      ? [{ name: resource.subject, url: new URL(subjectPath, siteOrigin).href }]
      : [{ name: resource.subject }]),
    { name: resource.title },
  ];
  const fields = [
    ["Subject", resource.subject],
    ["Resource type", resource.type === "note" ? "Study notes" : "Previous-year question paper"],
    ["Department", resource.department],
    ["Course", resource.course],
    ["Semester", resource.semester ? `Semester ${resource.semester}` : ""],
    ["Topic", resource.topic],
    ["Unit", resource.unit],
    ["University", resource.university],
    ["College", resource.college],
    ["Examination year", resource.examinationYear],
    ["Exam type", resource.examType],
  ].filter(([, value]) => value);
  const details = fields.map(([label, value]) => (
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
  )).join("");
  const resourceUrl = new URL(resource.path, siteOrigin).href;
  const subjectUrl = subjectPath ? new URL(subjectPath, siteOrigin).href : "";
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${new URL("/", siteOrigin).href}#organization`,
      name: "Topper",
      url: new URL("/", siteOrigin).href,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${new URL("/", siteOrigin).href}#website`,
      name: "Topper",
      url: new URL("/", siteOrigin).href,
      publisher: { "@id": `${new URL("/", siteOrigin).href}#organization` },
    },
    makeBreadcrumbs(bread),
    {
      "@context": "https://schema.org",
      "@type": "LearningResource",
      name: resource.title,
      description: resource.description,
      url: resourceUrl,
      learningResourceType: resource.type === "note" ? "Study notes" : "Question paper",
      inLanguage: "en",
      about: resource.topic
        ? [{ "@type": "Thing", name: resource.subject }, { "@type": "Thing", name: resource.topic }]
        : { "@type": "Thing", name: resource.subject },
      provider: { "@id": `${new URL("/", siteOrigin).href}#organization` },
      ...(resource.keywords.length ? { keywords: resource.keywords.join(", ") } : {}),
    },
  ];
  const title = resource.seoTitle;
  const description = resource.seoDescription;
  const body = `${renderBreadcrumbs(bread)}
    <article>
      <p class="muted">${escapeHtml(resource.type === "note" ? "Published study notes" : "Published question paper")}</p>
      <h1>${escapeHtml(resource.title)}</h1>
      <p class="lead">${escapeHtml(resource.description)}</p>
      <section class="card" aria-label="Resource details"><dl>${details}</dl></section>
      ${resource.topicPath ? `<p>Explore <a href="${escapeHtml(resource.topicPath)}">${escapeHtml(resource.topic)} notes and resources</a>.</p>` : ""}
      ${subjectUrl ? `<p>Browse more published material for <a href="${escapeHtml(subjectUrl)}">${escapeHtml(resource.subject)}</a>.</p>` : ""}
      <p><a href="/resources/${escapeHtml(resource.type)}/${escapeHtml(resource.id)}">Sign in to view the complete resource</a></p>
      <section aria-labelledby="related-heading"><h2 id="related-heading">Related published resources</h2>${renderResourceList(relatedResources)}</section>
    </article>`;
  return {
    title,
    description,
    canonical: resourceUrl,
    body,
    structuredData: schema,
    keywords: resource.keywords,
  };
}

function renderSubjectBody(data, siteOrigin) {
  const title = `${data.subject} Notes, Topics and Question Papers | Topper`;
  const description = `Browse ${data.resourceCount} published study resources for ${data.subject}, including notes and previous-year question papers shared on Topper.`;
  const subjectUrl = new URL(`/subjects/${data.slug}`, siteOrigin).href;
  const breadcrumbs = [
    { name: "Home", url: new URL("/", siteOrigin).href },
    { name: "Subjects", url: new URL("/subjects", siteOrigin).href },
    { name: data.subject },
  ];
  const topics = data.topics.length
    ? `<section aria-labelledby="topics-heading"><h2 id="topics-heading">Topics in ${escapeHtml(data.subject)}</h2><ul>${data.topics.map((topic) => `<li><a href="/subjects/${escapeHtml(data.slug)}/topics/${escapeHtml(topic.slug)}">${escapeHtml(topic.topic)}</a> <span class="muted">(${topic.resourceCount} resources)</span></li>`).join("")}</ul></section>`
    : "";
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${new URL("/", siteOrigin).href}#organization`,
      name: "Topper",
      url: new URL("/", siteOrigin).href,
    },
    makeBreadcrumbs(breadcrumbs),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description,
      url: subjectUrl,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: data.resourceCount,
        itemListElement: data.resources.map((resource, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: resource.title,
          url: new URL(resource.path, siteOrigin).href,
        })),
      },
    },
  ];
  const body = `${renderBreadcrumbs(breadcrumbs)}
    <h1>${escapeHtml(data.subject)} study resources</h1>
    <p class="lead">Browse ${data.resourceCount} published resources recorded for ${escapeHtml(data.subject)}. This page lists resource details supplied with the published notes and question papers.</p>
    ${topics}
    <section aria-labelledby="resources-heading"><h2 id="resources-heading">Published ${escapeHtml(data.subject)} resources</h2>${renderResourceList(data.resources)}</section>`;
  return {
    title,
    description,
    canonical: subjectUrl,
    body,
    structuredData: schema,
    keywords: [data.subject, ...data.topics.map((topic) => topic.topic)],
  };
}

function renderTopicBody(data, siteOrigin) {
  const title = `${data.topic} Notes | ${data.subject.subject} | Topper`;
  const description = `Browse ${data.resourceCount} published notes about ${data.topic} in ${data.subject.subject}, based on resource details shared on Topper.`;
  const topicPath = `/subjects/${data.subject.slug}/topics/${data.topicSlug}`;
  const canonical = new URL(topicPath, siteOrigin).href;
  const breadcrumbs = [
    { name: "Home", url: new URL("/", siteOrigin).href },
    { name: data.subject.subject, url: new URL(`/subjects/${data.subject.slug}`, siteOrigin).href },
    { name: data.topic },
  ];
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${new URL("/", siteOrigin).href}#organization`,
      name: "Topper",
      url: new URL("/", siteOrigin).href,
    },
    makeBreadcrumbs(breadcrumbs),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description,
      url: canonical,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: data.resourceCount,
        itemListElement: data.resources.map((resource, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: resource.title,
          url: new URL(resource.path, siteOrigin).href,
        })),
      },
    },
  ];
  const body = `${renderBreadcrumbs(breadcrumbs)}
    <h1>${escapeHtml(data.topic)} notes and study resources</h1>
    <p class="lead">Browse ${data.resourceCount} published notes labeled with the topic ${escapeHtml(data.topic)} in ${escapeHtml(data.subject.subject)}.</p>
    <section aria-labelledby="resources-heading"><h2 id="resources-heading">Published notes for ${escapeHtml(data.topic)}</h2>${renderResourceList(data.resources)}</section>`;
  return {
    title,
    description,
    canonical,
    body,
    structuredData: schema,
    keywords: [data.subject.subject, data.topic],
  };
}

function sendNotFound(response, message) {
  response
    .status(404)
    .set("X-Robots-Tag", "noindex")
    .type("html")
    .send(renderPage({
      title: "Page not found | Topper",
      description: message,
      canonical: "",
      body: `<h1>Page not found</h1><p>${escapeHtml(message)}</p><p><a href="/">Return to Topper</a></p>`,
      robots: "noindex,nofollow",
    }));
}

async function serveResourcePage(request, response, type) {
  const data = await getPublicResourcePage(type, request.params.resourceId);
  if (!data) {
    sendNotFound(response, "This published resource could not be found.");
    return;
  }
  const canonicalPath = data.resource.path;
  const requestedUrl = new URL(request.originalUrl, getSiteOrigin());
  if (requestedUrl.pathname !== canonicalPath || requestedUrl.search) {
    response.redirect(301, new URL(canonicalPath, getSiteOrigin()).href);
    return;
  }
  const page = renderResourceBody(data, getSiteOrigin());
  response
    .set("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
    .type("html")
    .send(renderPage(page));
}

seoRouter.get("/robots.txt", (_request, response) => {
  response
    .set("Cache-Control", "public, max-age=3600")
    .type("text/plain")
    .send([
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /login",
      "Disallow: /admin",
      "Disallow: /register",
      "Disallow: /forgot-password",
      "Disallow: /reset-password",
      "Disallow: /verify-email",
      "Disallow: /resend-verification",
      "Disallow: /dashboard",
      "Disallow: /library",
      "Disallow: /notifications",
      "Disallow: /upload",
      "Disallow: /uploads",
      "Disallow: /practice",
      "Disallow: /syllabus",
      "Disallow: /profile/",
      "Disallow: /resources/note/",
      `Sitemap: ${new URL("/sitemap.xml", getSiteOrigin()).href}`,
      "",
    ].join("\n"));
});

seoRouter.get("/sitemap.xml", async (_request, response) => {
  const entries = await buildSitemapEntries();
  const siteOrigin = getSiteOrigin();
  const urls = entries.map((entry) => {
    const loc = entry.url ?? new URL(entry.path, siteOrigin).href;
    const lastmod = entry.lastmod
      ? `<lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>`
      : "";
    return `<url><loc>${escapeHtml(loc)}</loc>${lastmod}</url>`;
  }).join("");
  response
    .set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
    .type("application/xml")
    .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

seoRouter.get("/api/seo/resources/:type/:resourceId", async (request, response) => {
  const data = await getPublicResourcePage(request.params.type, request.params.resourceId);
  if (!data) {
    response.status(404).json({ status: "error", message: "Published resource not found." });
    return;
  }
  response
    .set("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
    .json({ status: "success", ...data });
});

seoRouter.get("/api/seo/subjects", async (_request, response) => {
  const subjects = await getSubjectDirectoryPage();
  response
    .set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
    .json({ status: "success", subjects });
});

seoRouter.get("/api/seo/subjects/:subjectSlug/topics/:topicSlug", async (request, response) => {
  const topic = await getTopicPage(request.params.subjectSlug, request.params.topicSlug);
  if (!topic) {
    response.status(404).json({ status: "error", message: "Published topic not found." });
    return;
  }
  response
    .set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
    .json({ status: "success", topic });
});

seoRouter.get("/api/seo/subjects/:subjectSlug", async (request, response) => {
  const subject = await getSubjectPage(request.params.subjectSlug);
  if (!subject) {
    response.status(404).json({ status: "error", message: "Published subject not found." });
    return;
  }
  response
    .set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
    .json({ status: "success", subject });
});

seoRouter.get("/notes/:resourceId", (request, response) => serveResourcePage(request, response, "note"));
seoRouter.get("/notes/:resourceId/:slug", (request, response) => serveResourcePage(request, response, "note"));
seoRouter.get("/resources/pyq/:resourceId", (request, response) => serveResourcePage(request, response, "pyq"));
seoRouter.use((request, response, next) => {
  if (
    !["GET", "HEAD"].includes(request.method) ||
    request.path === "/" ||
    request.path.startsWith("/api/") ||
    !/text\/html/i.test(request.get("accept") ?? "")
  ) {
    next();
    return;
  }
  sendNotFound(response, "The requested Topper page could not be found.");
});

export default seoRouter;
