const mimeTypes = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export async function streamResourceView(request, response, {
  url,
  format,
  fileName,
  uploaderName,
}) {
  const range = request.get("range");
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) {
    throw badRequest("Only one valid byte range can be viewed at a time.");
  }

  const upstream = await fetch(url, {
    headers: range ? { Range: range } : {},
    redirect: "follow",
  });
  if (!upstream.ok && upstream.status !== 416) {
    await upstream.body?.cancel();
    const error = new Error("The resource file could not be retrieved from secure storage.");
    error.statusCode = 502;
    throw error;
  }
  if (!upstream.body) {
    const error = new Error("Secure storage returned an empty resource file.");
    error.statusCode = 502;
    throw error;
  }

  const safeName = fileName.replace(/[^\x20-\x7e]|[\r\n"\\]/g, "_");
  const safeUploaderName = encodeURIComponent(
    String(uploaderName ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100),
  );
  response.status(upstream.status);
  response.set({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename="${safeName}"`,
    "Content-Type": mimeTypes[format] ?? "application/octet-stream",
    "Cross-Origin-Resource-Policy": "same-site",
    "Referrer-Policy": "no-referrer",
    "X-Resource-Format": format,
    "X-Resource-Name": safeName,
    "X-Resource-Uploader": safeUploaderName,
    "X-Content-Type-Options": "nosniff",
  });
  for (const header of ["content-range", "content-length"]) {
    const value = upstream.headers.get(header);
    if (value) response.set(header, value);
  }
  response.stream(upstream.body);
}
