import { isAllowedCorsOrigin } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import {
  createRequestContext,
  createResponseContext,
  Router,
} from "./lib/router.js";
import { readRequestBody } from "./lib/request-body.js";
import authRouter from "./routes/auth.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import healthRouter from "./routes/health.routes.js";
import noteRouter from "./routes/note.routes.js";
import pyqRouter from "./routes/pyq.routes.js";
import resourceSearchRouter from "./routes/resource-search.routes.js";
import studentLibraryRouter from "./routes/student-library.routes.js";
import syllabusAnalysisRouter from "./routes/syllabus-analysis.routes.js";
import rewardsRouter from "./routes/rewards.routes.js";
import adminRouter from "./routes/admin.routes.js";
import notificationsRouter from "./routes/notifications.routes.js";
import profileRouter from "./routes/profile.routes.js";
import learningTutorRouter from "./routes/learning-tutor.routes.js";
import learningActivityRouter from "./routes/learning-activity.routes.js";
import aiPracticeRouter from "./routes/ai-practice.routes.js";
import seoRouter from "./routes/seo.routes.js";

const app = Router();
app.use(seoRouter);
app.get("/", (_request, response) => {
  response.json({ name: "Student Academic Resource Sharing API" });
});
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/notes", noteRouter);
app.use("/api/pyqs", pyqRouter);
app.use("/api/search", resourceSearchRouter);
app.use("/api/library", studentLibraryRouter);
app.use("/api/syllabus-analyses", syllabusAnalysisRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/profiles", profileRouter);
app.use("/api/learning-tutor", learningTutorRouter);
app.use("/api/learning-activity", learningActivityRouter);
app.use("/api/ai-practice", aiPracticeRouter);

const exposedHeaders = [
  "Accept-Ranges",
  "Content-Length",
  "Content-Range",
  "X-Resource-Format",
  "X-Resource-Name",
  "X-Resource-Uploader",
];

function applyCors(request, response) {
  const origin = request.headers.get("origin");
  if (origin && isAllowedCorsOrigin(origin)) {
    response.set({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": exposedHeaders.join(", "),
      Vary: "Origin",
    });
  }

  if (request.method === "OPTIONS") {
    if (origin && isAllowedCorsOrigin(origin)) {
      response.set({
        "Access-Control-Allow-Methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
        "Access-Control-Allow-Headers":
          request.headers.get("access-control-request-headers") ??
          "Content-Type, Authorization",
      });
    }
    response.status(204).send(null);
  }
}

function applySecurityHeaders(response) {
  const headers = {
    "Content-Security-Policy":
      "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Origin-Agent-Cluster": "?1",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-DNS-Prefetch-Control": "off",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Permitted-Cross-Domain-Policies": "none",
    "X-XSS-Protection": "0",
  };
  for (const [name, value] of Object.entries(headers)) {
    response.setDefault(name, value);
  }
}

export async function dispatchApiRequest(webRequest, pathname) {
  const request = createRequestContext(webRequest, pathname);
  const response = createResponseContext();

  try {
    applyCors(request, response);
    if (!response.sent) {
      const contentType = request.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const text = (
          await readRequestBody(
            webRequest,
            1024 * 1024,
            "Request body must be 1 MB or smaller.",
          )
        ).toString("utf8");
        try {
          request.body = text ? JSON.parse(text) : {};
        } catch {
          const error = new Error("Invalid JSON request body.");
          error.statusCode = 400;
          throw error;
        }
      }

      const handled = await app.handle(request, response);
      if (!handled) {
        notFoundHandler(request, response, (error) => {
          throw error;
        });
      }
    }
  } catch (error) {
    errorHandler(error, request, response, () => {});
  }

  applySecurityHeaders(response);
  return response.toResponse(request.method);
}

export default dispatchApiRequest;
