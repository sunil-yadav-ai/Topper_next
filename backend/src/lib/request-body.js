function sizeLimitError(message, code) {
  const error = new Error(message);
  error.statusCode = 413;
  if (code) error.code = code;
  return error;
}

export async function readRequestBody(webRequest, maxBytes, message, code) {
  const declaredLength = webRequest.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    throw sizeLimitError(message, code);
  }

  if (!webRequest.body) return Buffer.alloc(0);

  const reader = webRequest.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw sizeLimitError(message, code);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}
