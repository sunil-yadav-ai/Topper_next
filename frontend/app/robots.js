import { siteOrigin } from "../server/site-origin.js";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
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
        "/resources/note/",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteOrigin).href,
  };
}
