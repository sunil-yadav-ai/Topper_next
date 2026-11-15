import { readRequestBody } from "../lib/request-body.js";

function uploadError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function receiveMultipart({
  fields,
  maxFileSize,
  maxFiles = 1,
  single = false,
  uploadKind,
}) {
  return async (request, _response, next) => {
    try {
      if (!request.webRequest.headers.get("content-type")?.includes("multipart/form-data")) {
        const error = new Error("Expected a multipart form upload.");
        error.statusCode = 400;
        throw error;
      }
      if (request.multipartParsed) {
        const error = new Error("The upload form has already been read.");
        error.statusCode = 400;
        throw error;
      }
      request.multipartParsed = true;

      const headers = new Headers(request.webRequest.headers);
      headers.delete("content-length");
      const requestBody = await readRequestBody(
        request.webRequest,
        maxFileSize * maxFiles + 1024 * 1024,
        "Uploaded request is too large.",
        "LIMIT_FILE_SIZE",
      );
      let formData;
      try {
        formData = await new Request(request.webRequest.url, {
          method: request.webRequest.method,
          headers,
          body: requestBody,
        }).formData();
      } catch {
        const error = new Error("Invalid multipart form upload.");
        error.statusCode = 400;
        throw error;
      }
      const body = {};
      const files = {};
      let fileCount = 0;
      const fieldLimits = Array.isArray(fields)
        ? Object.fromEntries(fields.map((field) => [field, 1]))
        : fields;

      for (const [name, value] of formData.entries()) {
        if (typeof value === "string") {
          if (body[name] === undefined) body[name] = value;
          else if (Array.isArray(body[name])) body[name].push(value);
          else body[name] = [body[name], value];
          continue;
        }

        if (!Object.hasOwn(fieldLimits, name)) {
          throw uploadError("LIMIT_UNEXPECTED_FILE", "Unexpected upload field.");
        }
        fileCount += 1;
        if (
          fileCount > maxFiles ||
          (files[name]?.length ?? 0) >= fieldLimits[name]
        ) {
          throw uploadError("LIMIT_UNEXPECTED_FILE", "Too many uploaded files.");
        }
        if (value.size > maxFileSize) {
          throw uploadError("LIMIT_FILE_SIZE", "Uploaded file is too large.");
        }
        const file = {
          fieldname: name,
          originalname: value.name,
          encoding: "7bit",
          mimetype: value.type || "application/octet-stream",
          size: value.size,
          buffer: Buffer.from(await value.arrayBuffer()),
        };
        (files[name] ??= []).push(file);
      }

      request.body = body;
      request.files = files;
      if (single) {
        const uploaded = Object.values(files)[0]?.[0];
        request.file = uploaded;
      }
      next();
    } catch (error) {
      if (uploadKind) error.uploadKind = uploadKind;
      next(error);
    }
  };
}
