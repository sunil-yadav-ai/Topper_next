"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import {
  BookOpenText,
  Compass,
  FileText,
  Sparkles,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { gsap, ScrollTrigger } from "../lib/gsap.js";
import NotificationBell from "./NotificationBell.jsx";
import TopperLogo from "./TopperLogo.jsx";

gsap.registerPlugin(useGSAP);

export function SiteHeader() {
  const { user } = useAuth();
  return user ? <AuthenticatedSiteHeader user={user} /> : <PublicSiteHeader />;
}

function ActiveLink({ children, className = "", href, ...props }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      className={`${className}${active ? " is-active" : ""}`}
      href={href}
      {...props}
    >
      {children}
    </Link>
  );
}

function PublicSiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="ed-header ed-app-header">
      <div className="ed-header-inner">
        <Link aria-label="Topper home" className="ed-logo-link" href="/"><TopperLogo /></Link>
        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          className="ed-menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <span /><span />
        </button>
        <nav aria-label="Main navigation" className={`ed-nav ed-app-nav ${menuOpen ? "ed-nav-open" : ""}`}>
          <Link href="/search">Explore</Link>
          <Link href="/subjects">Subjects</Link>
          <Link href="/pyqs">Question papers</Link>
          <Link href="/login">Student sign in</Link>
          <Link className="ed-nav-cta" href="/register">
            Join for free
            <span aria-hidden="true" className="ed-arrow">→</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function AuthenticatedSiteHeader({ user }) {
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setMenuOpen(false);
    setSignOutError("");
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  async function handleSignOut() {
    setSignOutError("");
    try {
      await signOut();
      router.replace(user.role === "admin" ? "/admin/login" : "/");
    } catch (error) {
      setSignOutError(error.response?.data?.message ?? error.message ?? "Could not sign out. Please try again.");
    }
  }

  return (
    <header className="ed-header ed-app-header">
      <div className="ed-header-inner">
        <Link aria-label="Topper home" className="ed-logo-link" href="/"><TopperLogo /></Link>
        <button
          aria-expanded={menuOpen}
          aria-controls="ed-main-navigation"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          className="ed-menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          {menuOpen ? <X aria-hidden="true" size={21} /> : <Menu aria-hidden="true" size={21} />}
        </button>
        <nav aria-label="Main navigation" className={`ed-nav ed-app-nav ${menuOpen ? "ed-nav-open" : ""}`} id="ed-main-navigation">
          {user.role === "user" && (
            <>
              <ActiveLink className="ed-nav-link" href="/search"><Compass aria-hidden="true" />Explore</ActiveLink>
              <ActiveLink className="ed-nav-link" href="/uploads"><Upload aria-hidden="true" />Upload</ActiveLink>
              <ActiveLink className="ed-nav-link" href="/notes-to-pdf"><FileText aria-hidden="true" />Notes to PDF</ActiveLink>
              <ActiveLink className="ed-nav-link" href="/practice"><Sparkles aria-hidden="true" />AI Practice</ActiveLink>
              <ActiveLink className="ed-nav-link" href="/syllabus"><BookOpenText aria-hidden="true" />Syllabus analyzer</ActiveLink>
              {user.username && (
                <ActiveLink className="ed-nav-link" href={`/profile/${encodeURIComponent(user.username)}`}>
                  <UserRound aria-hidden="true" />My profile
                </ActiveLink>
              )}
              <ActiveLink className="ed-nav-link" href="/library"><LibraryBig aria-hidden="true" />My library</ActiveLink>
            </>
          )}
          {user.role === "admin" && (
            <ActiveLink className="ed-nav-link" href="/search"><Compass aria-hidden="true" />Explore</ActiveLink>
          )}
          <NotificationBell />
          <button className="ed-nav-signout" onClick={handleSignOut} type="button">
            <LogOut aria-hidden="true" />Sign out
          </button>
          {user.role === "admin" && (
            <Link className="ed-nav-cta" href="/admin">
              <LayoutDashboard aria-hidden="true" />
              Admin dashboard
              <span aria-hidden="true" className="ed-arrow">→</span>
            </Link>
          )}
        </nav>
        {signOutError && <p className="ed-nav-error" role="alert">{signOutError}</p>}
      </div>
    </header>
  );
}

export function SiteFooter() {
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    setShareUrl(encodeURIComponent(window.location.origin));
  }, []);
  const shareText = encodeURIComponent(
    "Learn Together. Rise Together. Discover Topper, a free student resource-sharing community.",
  );
  const contactEmail = (process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "").trim();
  const validContactEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
    ? contactEmail
    : "";

  return (
    <footer className="ed-footer ed-app-footer">
      <div aria-hidden="true" className="ed-footer-top-art"><span>✳</span><span>↗</span><span>✦</span></div>
      <div className="ed-footer-inner">
        <div className="ed-footer-main">
          <div className="ed-footer-brand">
            <Link aria-label="Topper home" href="/"><TopperLogo inverse /></Link>
            <p>Learn Together.<br /><span>Rise Together.</span></p>
            <span className="ed-footer-free">FREE TO LEARN · FREE TO SHARE</span>
          </div>
          <div className="ed-footer-links">
            <div><h2>Explore</h2><Link href="/search">Knowledge vault</Link><Link href="/subjects">Study subjects</Link><Link href="/pyqs">Previous-year papers</Link><Link href="/syllabus">Syllabus explorer</Link></div>
            <div><h2>Join in</h2><Link href="/register">Share your notes</Link><Link href="/login">Student sign in</Link><Link href="/library">Your library</Link></div>
            <div><h2>About</h2><Link href="/#about">Our story</Link><Link href="/#verification">Thoughtful verification</Link><Link href="/terms">Terms &amp; conditions</Link></div>
            <div><h2>Privacy</h2><Link href="/advertising">Privacy &amp; advertising details</Link>{validContactEmail ? <a href={`mailto:${validContactEmail}`}>Contact Topper</a> : <span className="ed-footer-coming-soon">Contact details coming soon</span>}</div>
          </div>
          <div className="ed-footer-social">
            <span>PASS THE GOOD STUFF ON.</span>
            <div aria-label="Share Topper" className="ed-social-links">
              <a aria-label="Share Topper on LinkedIn" href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`} rel="noreferrer" target="_blank">in</a>
              <a aria-label="Share Topper on X" href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`} rel="noreferrer" target="_blank">𝕏</a>
              <a aria-label="Share Topper on WhatsApp" href={`https://wa.me/?text=${shareText}%20${shareUrl}`} rel="noreferrer" target="_blank">↗</a>
            </div>
          </div>
        </div>
        <div className="ed-footer-bottom">
          <span>© {new Date().getFullYear()} Topper. Made for students, by students.</span>
          <span>Free to learn · Free to share</span>
          <a href="#top">Back to the top ↑</a>
        </div>
      </div>
    </footer>
  );
}

export default function ApplicationLayout({ children }) {
  const rootRef = useRef(null);
  const pathname = usePathname();

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const main = rootRef.current?.querySelector(".ed-app-content");
    if (!main) return;
    gsap.fromTo(
      main,
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.48, ease: "power3.out" },
    );
    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(refreshFrame);
  }, { scope: rootRef, dependencies: [pathname], revertOnUpdate: true });

  return (
    <div className="ed-site ed-app-site" id="top" ref={rootRef}>
      <SiteHeader />
      <div className="ed-app-content">{children}</div>
      <SiteFooter />
    </div>
  );
}
