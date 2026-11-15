export function notFoundHandler(request, _response, next) {
  const error = new Error(`Route not found: ${request.method} ${request.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(error, request, response, _next) {
  const isSyllabusUpload =
    request?.originalUrl?.startsWith("/api/syllabus-analyses") ?? false;
  const isProfilePhotoUpload =
    request?.originalUrl?.startsWith("/api/profiles/me") ?? false;
  let statusCode = Number.isInteger(error.statusCode)
    ? error.statusCode
    : Number.isInteger(error.status)
      ? error.status
      : 500;

  if (error.code === "LIMIT_FILE_SIZE") {
    statusCode = 413;
    error.message = isSyllabusUpload
      ? "Syllabus files must be 10 MB or smaller."
      : isProfilePhotoUpload
        ? "Profile photos must be 5 MB or smaller."
      : error.uploadKind === "pyq"
        ? "Question paper PDFs must be 20 MB or smaller."
        : "Note files must be 10 MB or smaller.";
  } else if (error.code === "LIMIT_UNEXPECTED_FILE") {
    statusCode = 400;
    error.message = isSyllabusUpload
      ? "Upload exactly one syllabus file."
      : isProfilePhotoUpload
        ? "Upload exactly one profile photo."
      : error.uploadKind === "pyq"
        ? "Upload exactly one question paper PDF."
        : "Upload exactly one note file.";
  } else if (error.code === 11000) {
    statusCode = 409;
    error.message = error.keyPattern?.email
      ? "An account with this email already exists."
      : "A record with these values already exists.";
  } else if (error.name === "ValidationError") {
    statusCode = 400;
    error.message = Object.values(error.errors)
      .map((validationError) => validationError.message)
      .join(" ");
  } else if (error.name === "CastError") {
    statusCode = 400;
    error.message = "Invalid request value.";
  }

  if (statusCode >= 500) {
    if (typeof error.code === "string" && error.code.startsWith("EMAIL_")) {
      console.error(`[${error.code}] ${error.message}`);
    } else {
      console.error(error);
    }
  }

  response.status(statusCode).json({
    status: "error",
    message:
      error.expose === true
        ? error.message
        : statusCode >= 500
          ? "Internal server error"
          : error.message,
  });
}
