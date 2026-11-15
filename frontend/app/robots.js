import { siteOrigin } from "../server/site-origin.js";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/search",
        "/login",
        "/admin",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/resend-verification",
        "/dashboard",
        "/library",
        "/notifications",
        "/upload",
        "/uploads",
        "/practice",
        "/syllabus",
        "/profile/",
        "/resources/",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteOrigin).href,
  };
}
