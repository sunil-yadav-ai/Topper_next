"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api.js";
import { JsonLd, breadcrumbSchema, organizationSchema } from "../../lib/seo-schema.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

function PublicPageShell({ breadcrumbs = [], children }) {
  return (
    <main className="min-h-screen bg-[#fff8eb] px-4 py-6 text-[#171717] sm:px-8 sm:py-10">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 border-b border-black/15 pb-5">
        <Link aria-label="Topper home" className="text-2xl font-black tracking-tight text-[#171717]" href="/">
          Top<span className="text-[#ff641f]">per</span>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-wrap gap-4 text-sm font-semibold">
          <Link className="hover:underline" href="/">Home</Link>
          <Link className="hover:underline" href="/search">Explore</Link>
        </nav>
      </header>
      <div className="mx-auto max-w-5xl py-6 sm:py-9">
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-600">
            <ol className="flex flex-wrap gap-2">
              {breadcrumbs.map((item, index) => (
                <li className="flex items-center gap-2" key={`${item.name}-${index}`}>
                  {index > 0 && <span aria-hidden="true">/</span>}
                  {item.path ? <Link className="hover:underline" href={item.path}>{item.name}</Link> : <span aria-current="page">{item.name}</span>}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {children}
      </div>
      <footer className="mx-auto max-w-5xl border-t border-black/15 py-5 text-sm text-slate-600">
        <Link className="font-semibold hover:underline" href="/">Topper home</Link>
        {" · "}
        <Link className="font-semibold hover:underline" href="/terms">Terms and community guidelines</Link>
        {" · "}
        <Link className="font-semibold hover:underline" href="/advertising">Advertising and privacy</Link>
      </footer>
    </main>
  );
}

function LoadingOrError({ loading, error }) {
  return (
    <section aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {loading ? <p>Loading published resource details…</p> : (
        <>
          <h1 className="text-2xl font-black">This page is unavailable</h1>
          <p className="mt-2 text-slate-600">{error}</p>
        </>
      )}
    </section>
  );
}

function loadErrorMessage(error) {
  return error.response?.data?.message ?? "The published information could not be loaded.";
}

function resourceTitle(resource) {
  return resource.seoTitle;
}

function resourceSchema(resource, siteOrigin) {
  const resourceUrl = new URL(resource.path, siteOrigin).href;
  return [
    ...organizationSchema(siteOrigin).slice(0, 1),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      ...(resource.subjectPath ? [{ name: resource.subject, path: resource.subjectPath }] : [{ name: resource.subject, path: "" }]),
      { name: resource.title, path: resource.path },
    ], siteOrigin),
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
      provider: { "@id": `${siteOrigin}/#organization` },
      ...(resource.keywords.length ? { keywords: resource.keywords.join(", ") } : {}),
    },
  ];
}

export function PublicResourcePage({ type, resourceId, siteOrigin, initialData }) {
  const { user } = useAuth();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setData(null);
    setError("");
    setLoading(true);
    api.get(`/seo/resources/${type}/${resourceId}`, { signal: controller.signal })
      .then(({ data: response }) => setData(response))
      .catch((requestError) => {
        if (requestError.code !== "ERR_CANCELED") setError(loadErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialData, resourceId, type]);

  const resource = data?.resource;
  const title = resource ? resourceTitle(resource) : "Published resource | Topper";
  const description = resource?.seoDescription ?? "Find published student study resources on Topper.";
  const crumbs = resource ? [
    { name: "Home", path: "/" },
    ...(resource.subjectPath ? [{ name: resource.subject, path: resource.subjectPath }] : [{ name: resource.subject }]),
    { name: resource.title },
  ] : [];
  const details = resource ? [
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
  ].filter(([, value]) => value) : [];
  const targetPath = resource ? `/resources/${resource.type}/${resource.id}` : "";

  return (
    <>
      <JsonLd data={resource ? resourceSchema(resource, siteOrigin) : undefined} />
      <PublicPageShell breadcrumbs={crumbs}>
        {!resource ? <LoadingOrError error={error} loading={loading} /> : (
          <article>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-indigo-700">
              {resource.type === "note" ? "Published study notes" : "Published question paper"}
            </p>
            <h1 className="mt-2 max-w-4xl break-words text-3xl font-black tracking-tight sm:text-5xl">{resource.title}</h1>
            <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-7 text-slate-700">{resource.description}</p>
            <section aria-label="Resource details" className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-extrabold">Resource details</h2>
              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {details.map(([label, value]) => (
                  <div className="min-w-0" key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className="mt-1 break-words font-semibold text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="rounded-xl bg-indigo-700 px-5 py-3 text-center font-bold text-white hover:bg-indigo-800" href={user ? targetPath : "/login"}>
                {user ? "Open resource" : "Sign in to view the complete resource"}
              </Link>
              {resource.topicPath && (
                <Link className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-center font-bold text-slate-800 hover:bg-slate-50" href={resource.topicPath}>
                  More on {resource.topic}
                </Link>
              )}
              {resource.subjectPath && (
                <Link className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-center font-bold text-slate-800 hover:bg-slate-50" href={resource.subjectPath}>
                  More {resource.subject} resources
                </Link>
              )}
            </div>
            <section aria-labelledby="related-resources-heading" className="mt-10">
              <h2 className="text-2xl font-black" id="related-resources-heading">Related published resources</h2>
              {data.relatedResources.length ? (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {data.relatedResources.map((related) => (
                    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={`${related.type}-${related.id}`}>
                      <Link className="font-bold text-indigo-800 hover:underline" href={related.path}>{related.title}</Link>
                      <p className="mt-1 text-sm text-slate-600">{[related.type === "note" ? "Study notes" : "Question paper", related.subject, related.university, related.examinationYear].filter(Boolean).join(" · ")}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-3 text-slate-600">No related published resources are listed yet.</p>}
            </section>
          </article>
        )}
      </PublicPageShell>
    </>
  );
}

function collectionSchema(name, description, path, resources, siteOrigin) {
  return [
    ...organizationSchema(siteOrigin).slice(0, 1),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name,
      description,
      url: new URL(path, siteOrigin).href,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: resources.length,
        itemListElement: resources.map((resource, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: resource.title,
          url: new URL(resource.path, siteOrigin).href,
        })),
      },
    },
  ];
}

function usePublicData(path, key, initialResponse) {
  const [data, setData] = useState(initialResponse?.[key] ?? null);
  const [loading, setLoading] = useState(!initialResponse);
  const [error, setError] = useState("");
  useEffect(() => {
    if (initialResponse) {
      setData(initialResponse[key] ?? null);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setData(null);
    setError("");
    setLoading(true);
    api.get(path, { signal: controller.signal })
      .then(({ data: response }) => setData(response[key]))
      .catch((requestError) => {
        if (requestError.code !== "ERR_CANCELED") setError(loadErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialResponse, key, path]);
  return { data, error, loading };
}

function SubjectResourceList({ resources }) {
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {resources.map((resource) => (
        <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={`${resource.type}-${resource.id}`}>
          <Link className="font-bold text-indigo-800 hover:underline" href={resource.path}>{resource.title}</Link>
          <p className="mt-1 text-sm text-slate-600">{[resource.type === "note" ? "Study notes" : "Question paper", resource.subject, resource.university, resource.examinationYear].filter(Boolean).join(" · ")}</p>
        </li>
      ))}
    </ul>
  );
}

export function SubjectDirectoryPage({ siteOrigin, initialData }) {
  const { data: subjects, error, loading } = usePublicData("/seo/subjects", "subjects", initialData);
  const description = subjects
    ? `Browse ${subjects.length} subjects with published student notes and previous-year question papers on Topper.`
    : "Browse subject areas with published student notes and previous-year question papers on Topper.";
  const schema = subjects?.length
    ? [
        ...organizationSchema(siteOrigin).slice(0, 1),
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Study Subjects, Notes and Question Papers | Topper",
          description,
          url: new URL("/subjects", siteOrigin).href,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: subjects.length,
            itemListElement: subjects.map((subject, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: subject.subject,
              url: new URL(`/subjects/${subject.slug}`, siteOrigin).href,
            })),
          },
        },
      ]
    : undefined;

  return (
    <>
      <JsonLd data={schema} />
      <PublicPageShell breadcrumbs={[{ name: "Home", path: "/" }, { name: "Subjects" }]}>
        <h1 className="text-3xl font-black sm:text-5xl">Browse study subjects</h1>
        <p className="mt-3 max-w-3xl leading-7 text-slate-700">Explore subject areas with published resources shared on Topper.</p>
        {loading ? <p aria-live="polite" className="mt-6">Loading available subjects…</p> : error ? (
          <p className="mt-6 rounded-xl bg-white p-4 text-rose-700" role="alert">{error}</p>
        ) : subjects.length ? (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((subject) => (
              <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={subject.slug}>
                <Link className="font-bold text-indigo-800 hover:underline" href={`/subjects/${subject.slug}`}>{subject.subject}</Link>
                <p className="mt-1 text-sm text-slate-600">{subject.resourceCount} published resources</p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-slate-600">No subject pages are available until subjects have enough published resources.</p>}
      </PublicPageShell>
    </>
  );
}

export function SubjectPage({ slug, siteOrigin, initialData }) {
  const { data: subject, error, loading } = usePublicData(`/seo/subjects/${slug}`, "subject", initialData);
  const title = subject
    ? `${subject.subject} Notes, Topics and Question Papers | Topper`
    : "Study subject | Topper";
  const description = subject
    ? `Browse ${subject.resourceCount} published study resources for ${subject.subject}, including notes and previous-year question papers shared on Topper.`
    : "Browse published notes and question papers by subject on Topper.";
  const schema = subject
    ? [
        ...organizationSchema(siteOrigin).slice(0, 1),
        breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Subjects", path: "/subjects" },
          { name: subject.subject, path: `/subjects/${subject.slug}` },
        ], siteOrigin),
        ...collectionSchema(title, description, `/subjects/${subject.slug}`, subject.resources, siteOrigin).slice(1),
      ]
    : undefined;
  const crumbs = subject
    ? [{ name: "Home", path: "/" }, { name: "Subjects", path: "/subjects" }, { name: subject.subject }]
    : [];

  return (
    <>
      <JsonLd data={schema} />
      <PublicPageShell breadcrumbs={crumbs}>
        {!subject ? <LoadingOrError error={error} loading={loading} /> : (
          <>
            <h1 className="text-3xl font-black sm:text-5xl">{subject.subject} study resources</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-700">
              Browse {subject.resourceCount} published resources recorded for {subject.subject}. This page lists resource details supplied with the published notes and question papers.
            </p>
            {subject.topics.length > 0 && (
              <section aria-labelledby="subject-topics-heading" className="mt-8">
                <h2 className="text-2xl font-black" id="subject-topics-heading">Topics in {subject.subject}</h2>
                <ul className="mt-3 flex flex-wrap gap-3">
                  {subject.topics.map((topic) => (
                    <li key={topic.slug}>
                      <Link className="inline-flex rounded-full border border-indigo-200 bg-white px-4 py-2 font-semibold text-indigo-800 hover:bg-indigo-50" href={`/subjects/${subject.slug}/topics/${topic.slug}`}>
                        {topic.topic} <span className="ml-2 text-sm text-slate-500">({topic.resourceCount})</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section aria-labelledby="subject-resources-heading" className="mt-8">
              <h2 className="text-2xl font-black" id="subject-resources-heading">Published {subject.subject} resources</h2>
              <SubjectResourceList resources={subject.resources} />
            </section>
          </>
        )}
      </PublicPageShell>
    </>
  );
}

export function TopicPage({ slug, topicSlug, siteOrigin, initialData }) {
  const path = `/seo/subjects/${slug}/topics/${topicSlug}`;
  const { data, error, loading } = usePublicData(path, "topic", initialData);
  const topic = data?.topic;
  const title = topic
    ? `${topic.topic} Notes | ${topic.subject.subject} | Topper`
    : "Study topic | Topper";
  const description = topic
    ? `Browse ${topic.resourceCount} published notes about ${topic.topic} in ${topic.subject.subject}, based on resource details shared on Topper.`
    : "Browse published topic notes and study resources on Topper.";
  const canonicalPath = topic
    ? `/subjects/${topic.subject.slug}/topics/${topic.topicSlug}`
    : undefined;
  const schema = topic
    ? [
        ...organizationSchema(siteOrigin).slice(0, 1),
        breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: topic.subject.subject, path: `/subjects/${topic.subject.slug}` },
          { name: topic.topic, path: canonicalPath },
        ], siteOrigin),
        ...collectionSchema(title, description, canonicalPath, topic.resources, siteOrigin).slice(1),
      ]
    : undefined;
  const breadcrumbs = topic
    ? [
        { name: "Home", path: "/" },
        { name: topic.subject.subject, path: `/subjects/${topic.subject.slug}` },
        { name: topic.topic },
      ]
    : [];

  return (
    <>
      <JsonLd data={schema} />
      <PublicPageShell breadcrumbs={breadcrumbs}>
        {!topic ? <LoadingOrError error={error} loading={loading} /> : (
          <>
            <h1 className="text-3xl font-black sm:text-5xl">{topic.topic} notes and study resources</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-700">
              Browse {topic.resourceCount} published notes labeled with the topic {topic.topic} in {topic.subject.subject}.
            </p>
            <section aria-labelledby="topic-resources-heading" className="mt-8">
              <h2 className="text-2xl font-black" id="topic-resources-heading">Published notes for {topic.topic}</h2>
              <SubjectResourceList resources={topic.resources} />
            </section>
          </>
        )}
      </PublicPageShell>
    </>
  );
}
