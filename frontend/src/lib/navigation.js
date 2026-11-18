export function getPostLoginPath(user) {
  if (user?.role === "admin") return "/admin";
  if (user?.username) return `/profile/${encodeURIComponent(user.username)}`;
  return "/search";
}

export function getPublicResourcePath(resource) {
  const type = resource?.type === "pyq" ? "pyq" : "note";
  if (type === "pyq") {
    return `/resources/pyq/${encodeURIComponent(resource.id)}`;
  }
  const title = resource?.title?.trim() || `${resource.subject} notes`;
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const resourcePath = `/notes/${encodeURIComponent(resource.id)}`;
  return slug ? `${resourcePath}/${slug}` : resourcePath;
}
