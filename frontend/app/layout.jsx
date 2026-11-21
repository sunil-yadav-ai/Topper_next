import "lenis/dist/lenis.css";
import "../src/index.css";
import { AuthProvider } from "../src/context/AuthContext.jsx";
import AppRuntime from "../src/components/AppRuntime.jsx";
import { siteOrigin } from "../server/site-origin.js";

export const metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: "Topper — Free Study Notes and Previous-Year Papers",
    template: "%s",
  },
  description:
    "Explore free student-shared study notes, subject resources and previous-year question papers on Topper. Learn together. Rise together.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    title: "Topper — Free Study Notes and Previous-Year Papers",
    description:
      "Explore free student-shared study notes, subject resources and previous-year question papers on Topper. Learn together. Rise together.",
    url: "/",
    siteName: "Topper",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Topper — Free Study Notes and Previous-Year Papers",
    description:
      "Explore free student-shared study notes, subject resources and previous-year question papers on Topper. Learn together. Rise together.",
  },
  icons: {
    icon: "/topper-icon.svg",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fff8eb",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <AppRuntime />
        </AuthProvider>
      </body>
    </html>
  );
}
