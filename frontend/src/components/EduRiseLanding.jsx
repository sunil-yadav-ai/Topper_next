"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import AdUnit from "./AdUnit.jsx";
import { AuthenticatedSiteHeader } from "./SiteChrome.jsx";
import TopperLogo from "./TopperLogo.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getPostLoginPath } from "../lib/navigation.js";
import { api } from "../lib/api.js";
import { Flip, Observer, ScrollTrigger, gsap } from "../lib/gsap.js";

gsap.registerPlugin(useGSAP);

const subjects = [
  { name: "Computer Science", short: "CS", color: "lilac", art: "code" },
  { name: "Mathematics", short: "∑", color: "orange", art: "math" },
  { name: "Physics", short: "ϟ", color: "blue", art: "physics" },
  { name: "Chemistry", short: "H₂", color: "yellow", art: "chem" },
  { name: "Electronics", short: "⌁", color: "pink", art: "circuit" },
  { name: "More subjects", short: "+", color: "green", art: "more" },
];

const learningSteps = [
  {
    number: "01",
    title: "Upload your notes",
    detail: "Share your handwritten notes or a paper you found useful.",
    label: "YOUR KNOWLEDGE, PASSED ON",
    color: "orange",
    doodle: "upload",
  },
  {
    number: "02",
    title: "AI checks the pages",
    detail: "OCR and academic checks help make each page easier to explore.",
    label: "CAREFUL, PAGE BY PAGE",
    color: "purple",
    doodle: "scan",
  },
  {
    number: "03",
    title: "Students find their next step",
    detail: "Search by course, subject, semester, unit, or topic.",
    label: "THE RIGHT NOTES, RIGHT ON TIME",
    color: "blue",
    doodle: "discover",
  },
  {
    number: "04",
    title: "Everyone rises together",
    detail: "Helpful contributions get recognized. Learning stays free.",
    label: "GOOD THINGS GROW WHEN SHARED",
    color: "lime",
    doodle: "rise",
  },
];

function Reveal({ children, className = "", delay = 0 }) {
  return (
    <div
      className={`ed-reveal ${className}`}
      data-reveal-delay={delay}
    >
      {children}
    </div>
  );
}

function Arrow({ diagonal = false }) {
  return <span aria-hidden="true" className="ed-arrow">{diagonal ? "↗" : "→"}</span>;
}

function ButtonLink({ children, href, kind = "dark", className = "" }) {
  return (
    <Link className={`ed-button ed-button-${kind} ${className}`} href={href}>
      {children}
      <Arrow />
    </Link>
  );
}

function Mascot({ className = "" }) {
  return (
    <svg
      aria-label="Topper's cheerful orange study buddy holding a notebook"
      className={className}
      fill="none"
      role="img"
      viewBox="0 0 430 390"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="mascotBody" x1="87" x2="312" y1="126" y2="330" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9B3D" />
          <stop offset="1" stopColor="#F34C20" />
        </linearGradient>
        <linearGradient id="mascotBook" x1="165" x2="296" y1="215" y2="317" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFEF6" />
          <stop offset="1" stopColor="#F3E9D1" />
        </linearGradient>
        <filter id="mascotShadow" width="1.5" height="1.5" x="-.25" y="-.2">
          <feDropShadow dx="0" dy="15" floodColor="#4E2D17" floodOpacity=".2" stdDeviation="13" />
        </filter>
      </defs>
      <ellipse cx="221" cy="346" fill="#171717" fillOpacity=".12" rx="126" ry="17" />
      <g className="ed-mascot-float" filter="url(#mascotShadow)">
        <path d="M104 174c0-57 43-99 103-99 63 0 107 41 107 104v65c0 52-43 94-96 94h-28c-53 0-96-42-96-94v-70Z" fill="url(#mascotBody)" stroke="#171717" strokeLinejoin="round" strokeWidth="7" />
        <path d="M113 159c0-59 40-96 96-96 59 0 99 39 99 99" stroke="#171717" strokeLinecap="round" strokeWidth="13" />
        <path d="M105 155h24v66h-24c-9 0-17-8-17-17v-32c0-9 8-17 17-17ZM316 155h-24v66h24c9 0 17-8 17-17v-32c0-9-8-17-17-17Z" fill="#C8EA24" stroke="#171717" strokeLinejoin="round" strokeWidth="6" />
        <path d="M164 178c0-11 7-19 16-19s16 8 16 19-7 19-16 19-16-8-16-19ZM226 178c0-11 7-19 16-19s16 8 16 19-7 19-16 19-16-8-16-19Z" fill="#171717" />
        <circle cx="186" cy="172" r="4" fill="white" />
        <circle cx="248" cy="172" r="4" fill="white" />
        <path d="M196 214c10 12 23 12 34 0" stroke="#171717" strokeLinecap="round" strokeWidth="7" />
        <ellipse cx="149" cy="206" fill="#FFB5A0" rx="12" ry="7" />
        <ellipse cx="276" cy="206" fill="#FFB5A0" rx="12" ry="7" />
        <path d="M108 258c22-9 45-7 65 7l19 15-24 34c-5 7-15 9-22 4l-43-31 5-29ZM310 258c-22-9-45-7-65 7l-19 15 24 34c5 7 15 9 22 4l43-31-5-29Z" fill="#F36D2B" stroke="#171717" strokeLinejoin="round" strokeWidth="6" />
        <path d="M177 250c0-7 6-13 13-13h34c7 0 13 6 13 13v63c0 7-6 13-13 13h-34c-7 0-13-6-13-13v-63Z" fill="url(#mascotBook)" stroke="#171717" strokeWidth="6" />
        <path d="M220 246h50c7 0 13 6 13 13v52c0 7-6 13-13 13h-50v-78Z" fill="#FFF9EC" stroke="#171717" strokeWidth="6" />
        <path d="M220 246v78M237 267h29M237 279h24M190 265h18M190 277h18M190 289h18" stroke="#9270E8" strokeLinecap="round" strokeWidth="5" />
        <path d="m193 107 8-18 8 18 18 8-18 8-8 18-8-18-18-8 18-8ZM293 89l5-11 5 11 11 5-11 5-5 11-5-11-11-5 11-5Z" fill="#FFD447" stroke="#171717" strokeLinejoin="round" strokeWidth="4" />
      </g>
      <g className="ed-paper-float">
        <path d="m42 145 59-14 16 68-59 14-16-68Z" fill="#70C9F5" stroke="#171717" strokeLinejoin="round" strokeWidth="5" />
        <path d="m57 157 31-7M61 171l31-7M65 185l19-4" stroke="#171717" strokeLinecap="round" strokeWidth="4" />
        <path d="m339 192 44 3-4 74-44-3 4-74Z" fill="#9270E8" stroke="#171717" strokeLinejoin="round" strokeWidth="5" />
        <path d="m352 209 18 1M351 223l17 1M350 237l14 1" stroke="#FFF9EC" strokeLinecap="round" strokeWidth="4" />
        <path d="m70 66 8-18 8 18 18 8-18 8-8 18-8-18-18-8 18-8ZM349 69l6-14 6 14 14 6-14 6-6 14-6-14-14-6 14-6Z" fill="#FFD447" stroke="#171717" strokeLinejoin="round" strokeWidth="4" />
      </g>
    </svg>
  );
}

function HeroNotebook() {
  return (
    <div aria-label="Illustration of the Topper study mascot surrounded by notes and study supplies" className="ed-hero-art" role="img">
      <div aria-hidden="true" className="ed-orbit ed-orbit-one" />
      <div aria-hidden="true" className="ed-orbit ed-orbit-two" />
      <div className="ed-sticker ed-sticker-note"><span>little steps</span><strong>BIG IDEAS</strong><i>✳</i></div>
      <div className="ed-sticker ed-sticker-pdf"><b>PDF</b><span>open notes</span></div>
      <div className="ed-pencil"><span /></div>
      <div className="ed-hero-spark ed-spark-a">✳</div>
      <div className="ed-hero-spark ed-spark-b">✦</div>
      <div className="ed-hero-spark ed-spark-c">✧</div>
      <div className="ed-art-doodle ed-doodle-a">+</div>
      <div className="ed-art-doodle ed-doodle-b">~</div>
      <div className="ed-mascot-stage">
        <span className="ed-stage-label"><i /> your study buddy</span>
        <Mascot className="ed-mascot" />
      </div>
      <div className="ed-note-card ed-note-card-top">
        <span className="ed-note-tab" />
        <b>today's big idea</b>
        <span className="ed-note-line" />
        <span className="ed-note-line short" />
        <span className="ed-note-highlight">learn it · share it</span>
      </div>
      <div className="ed-note-card ed-note-card-bottom">
        <span className="ed-note-scribble">x² + y²</span>
        <span className="ed-note-caption">practice page 04</span>
      </div>
    </div>
  );
}

function SubjectArt({ art }) {
  if (art === "code") {
    return <span aria-hidden="true" className="ed-subject-illustration ed-code-art"><span>&lt;/&gt;</span><i /><b /></span>;
  }
  if (art === "math") {
    return <span aria-hidden="true" className="ed-subject-illustration ed-math-art"><span>∑</span><i>π</i><b>÷</b></span>;
  }
  if (art === "physics") {
    return <span aria-hidden="true" className="ed-subject-illustration ed-physics-art"><span>ϟ</span><i /><b /></span>;
  }
  if (art === "chem") {
    return <span aria-hidden="true" className="ed-subject-illustration ed-chem-art"><span>⚗</span><i /><b /></span>;
  }
  if (art === "circuit") {
    return <span aria-hidden="true" className="ed-subject-illustration ed-circuit-art"><span>⌁</span><i /><b /></span>;
  }
  return <span aria-hidden="true" className="ed-subject-illustration ed-more-art"><span>✳</span><i>?</i><b>+</b></span>;
}

function SubjectVault() {
  const [counts, setCounts] = useState({});
  const [error, setError] = useState(false);
  const vaultRef = useRef(null);

  useEffect(() => {
    let active = true;
    let refreshFrame;
    Promise.all([
      api.get("/search", { params: { limit: 1 } }).then(({ data }) => [
        "all",
        data.pagination.total,
      ]),
      ...subjects.slice(0, -1).map(async (subject) => {
        const { data } = await api.get("/search", {
          params: { subject: subject.name, limit: 1 },
        });
        return [subject.name, data.pagination.total];
      }),
    ])
      .then((results) => {
        if (active) {
          setCounts(Object.fromEntries(results));
          refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (refreshFrame) cancelAnimationFrame(refreshFrame);
    };
  }, []);

  useEffect(() => {
    const counters = [...(vaultRef.current?.querySelectorAll("[data-resource-count]") ?? [])];
    if (!counters.length) return undefined;
    const animations = counters.map((element) => {
      const target = Number(element.dataset.resourceCount);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
      const value = { current: 0 };
      element.textContent = "0";
      const tween = gsap.to(value, {
        current: target,
        duration: 1.15,
        ease: "power2.out",
        paused: true,
        onUpdate: () => {
          element.textContent = Math.round(value.current).toLocaleString();
        },
      });
      const trigger = ScrollTrigger.create({
        trigger: element,
        start: "top 92%",
        once: true,
        onEnter: () => tween.play(),
      });
      return { tween, trigger };
    });

    return () => {
      animations.forEach((animation) => {
        animation?.trigger.kill();
        animation?.tween.kill();
      });
    };
  }, [counts]);

  return (
    <section className="ed-section ed-vault" id="explore" ref={vaultRef}>
      <div className="ed-section-inner">
        <Reveal className="ed-section-heading">
          <span className="ed-eyebrow"><span className="ed-eyebrow-dot" /> THE KNOWLEDGE VAULT</span>
          <div className="ed-heading-row">
            <h2>Curiosity has <span>a home.</span></h2>
            <p>Find the notes, papers and tiny “aha!” moments that make a big difference.</p>
          </div>
        </Reveal>
        <div className="ed-subject-grid">
          {subjects.map((subject, index) => {
            const href = subject.name === "More subjects"
              ? "/search"
              : `/search?subject=${encodeURIComponent(subject.name)}`;
            return (
              <Reveal className={`ed-subject-reveal ed-subject-${subject.color}`} delay={index * 70} key={subject.name}>
                <Link className={`ed-subject-card ed-card-${subject.color}`} href={href}>
                  <div className="ed-subject-card-top">
                    <span className="ed-subject-number">0{index + 1} / 06</span>
                    <span className="ed-subject-symbol">{subject.short}</span>
                  </div>
                  <SubjectArt art={subject.art} />
                  <div className="ed-subject-copy">
                    <h3>{subject.name}</h3>
                    <p>
                      {error
                        ? subject.name === "More subjects" ? "Browse every subject" : "Explore shared resources"
                        : (subject.name === "More subjects" ? counts.all : counts[subject.name]) === undefined
                          ? "Finding your collection…"
                          : subject.name === "More subjects"
                            ? <>Browse all <span data-resource-count={counts.all}>{counts.all.toLocaleString()}</span> published resources</>
                            : <><span data-resource-count={counts[subject.name]}>{counts[subject.name].toLocaleString()}</span> resource{counts[subject.name] === 1 ? "" : "s"} to explore</>}
                    </p>
                  </div>
                  <span aria-label={`Explore ${subject.name}`} className="ed-subject-go"><Arrow diagonal /></span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
      <span aria-hidden="true" className="ed-vault-scribble">keep exploring ✳</span>
    </section>
  );
}

function VerificationIllustration() {
  return (
    <div aria-label="Illustration showing a notebook page being carefully checked by Topper AI" className="ed-verification-art" role="img">
      <div aria-hidden="true" className="ed-verification-sun">✳</div>
      <div aria-hidden="true" className="ed-check-doodle">✓</div>
      <div className="ed-ai-tag"><span className="ed-ai-pulse" /> EDU AI · PAGE CHECK</div>
      <div className="ed-paper-stack">
        <div className="ed-paper-shadow" />
        <div className="ed-paper-sheet">
          <div className="ed-paper-heading"><span>UNIT 02</span><b>Motion &amp; forces</b></div>
          <div className="ed-paper-rule" />
          <div className="ed-handwritten">An object stays in motion...</div>
          <div className="ed-paper-highlight">unless a force acts on it</div>
          <div className="ed-paper-rule short" />
          <div className="ed-formula"><span>F = m × a</span><b>✓</b></div>
          <div className="ed-paper-rule" />
          <div className="ed-paper-rule half" />
          <div className="ed-paper-page">PAGE 04 <span>•</span> PHYSICS</div>
          <div className="ed-scan-line" />
        </div>
        <div aria-hidden="true" className="ed-paper-pencil" />
      </div>
      <div className="ed-check-card ed-check-card-one">
        <span className="ed-check-icon ed-check-green">✓</span>
        <span><b>Handwriting recognized</b><small>Page-by-page OCR</small></span>
      </div>
      <div className="ed-check-card ed-check-card-two">
        <span className="ed-check-icon ed-check-purple">◎</span>
        <span><b>Topic relevance</b><small>Matched to Physics</small></span>
      </div>
      <div className="ed-check-card ed-check-card-three">
        <span className="ed-check-icon ed-check-orange">✳</span>
        <span><b>Academic accuracy</b><small>Carefully cross-checked</small></span>
      </div>
      <span className="ed-page-sticker">01 <i>/</i> 08</span>
    </div>
  );
}

function VerificationSection() {
  return (
    <section className="ed-section ed-verification" id="verification">
      <div className="ed-section-inner ed-verification-layout">
        <Reveal className="ed-verification-visual">
          <VerificationIllustration />
        </Reveal>
        <Reveal className="ed-verification-copy" delay={100}>
          <span className="ed-eyebrow ed-eyebrow-light"><span className="ed-eyebrow-dot" /> A LITTLE EXTRA CARE</span>
          <h2>Good notes deserve a <span>good check.</span></h2>
          <p className="ed-verification-intro">
            Our AI helps read handwritten pages and review the academic details. It’s a thoughtful second look—not a rewrite of anyone’s work.
          </p>
          <ul className="ed-verification-points">
            <li><span className="ed-point-icon">✎</span><span><b>Handwriting, recognized</b><small>Text and formulas are read one page at a time.</small></span></li>
            <li><span className="ed-point-icon">⌕</span><span><b>Relevance, checked</b><small>Topics are compared with the subject they belong to.</small></span></li>
            <li><span className="ed-point-icon">↗</span><span><b>Uncertainty, respected</b><small>Hard-to-read writing is flagged for a human—not called a mistake.</small></span></li>
          </ul>
          <div aria-label="Possible review outcomes" className="ed-outcomes">
            <span className="ed-outcome ed-outcome-approved"><i>✓</i> APPROVED</span>
            <span className="ed-outcome ed-outcome-warning"><i>!</i> WARNING</span>
            <span className="ed-outcome ed-outcome-review"><i>↗</i> HUMAN REVIEW</span>
          </div>
        </Reveal>
      </div>
      <span aria-hidden="true" className="ed-verification-footnote">thoughtful by design ↗</span>
    </section>
  );
}

function StepArt({ type }) {
  return (
    <div aria-hidden="true" className={`ed-step-art ed-step-art-${type}`}>
      {type === "upload" && <><span className="ed-step-sheet">NOTES<br /><b>✎</b></span><i>↑</i><b className="ed-step-star">✳</b></>}
      {type === "scan" && <><span className="ed-step-scan-sheet"><i /><i /><i /><b>✓</b></span><span className="ed-step-beam" /><b className="ed-step-star">✳</b></>}
      {type === "discover" && <><span className="ed-step-magnify">⌕</span><span className="ed-step-tile">PDF</span><b className="ed-step-star">✦</b></>}
      {type === "rise" && <><span className="ed-step-rise-book">↗</span><b className="ed-step-star">✳</b><i>✧</i></>}
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="ed-section ed-how" id="how-it-works">
      <div className="ed-section-inner">
        <Reveal className="ed-section-heading">
          <span className="ed-eyebrow"><span className="ed-eyebrow-dot" /> FOUR LITTLE STEPS</span>
          <div className="ed-heading-row">
            <h2>Pass it on. <span>Power up.</span></h2>
            <p>From one student’s scribbles to everyone’s “I get it now.”</p>
          </div>
        </Reveal>
        <div className="ed-steps">
          <svg aria-hidden="true" className="ed-step-route" preserveAspectRatio="none" viewBox="0 0 1200 220">
            <path className="ed-step-route-path" d="M 28 122 C 170 122 173 76 315 76 S 454 132 600 122 S 750 72 885 82 S 1042 122 1172 88" fill="none" />
            <circle className="ed-step-route-star" cx="0" cy="0" r="8" />
          </svg>
          {learningSteps.map((step, index) => (
            <Reveal className={`ed-step-wrap ed-step-wrap-${step.color}`} delay={index * 80} key={step.number}>
              <article className={`ed-step ed-step-${step.color}`}>
                <div className="ed-step-head"><span>{step.number}</span><span className="ed-step-label">{step.label}</span></div>
                <StepArt type={step.doodle} />
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </article>
              {index < learningSteps.length - 1 && <span aria-hidden="true" className="ed-step-connector">↗</span>}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContributorIllustration({ type }) {
  return (
    <div aria-hidden="true" className={`ed-contributor-portrait ed-portrait-${type}`}>
      <span className="ed-portrait-halo" />
      {type === "sun" && <><span className="ed-portrait-hair" /><span className="ed-portrait-face"><i /><i /><b /></span><span className="ed-portrait-body" /></>}
      {type === "wave" && <><span className="ed-portrait-hair" /><span className="ed-portrait-face"><i /><i /><b /></span><span className="ed-portrait-body" /></>}
      {type === "star" && <><span className="ed-portrait-hair" /><span className="ed-portrait-face"><i /><i /><b /></span><span className="ed-portrait-body" /></>}
      <span className="ed-portrait-spark">✳</span>
    </div>
  );
}

function HallOfFame() {
  const gridRef = useRef(null);
  const cardRefs = useRef([]);
  const [featuredCard, setFeaturedCard] = useState(null);
  const { contextSafe } = useGSAP({ scope: gridRef });
  const animateCard = contextSafe((state) => {
    Flip.from(state, {
      duration: 0.46,
      ease: "power2.out",
      scale: true,
      simple: true,
    });
  });
  const setFeatured = contextSafe((type) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = cardRefs.current.filter(Boolean);
    const state = Flip.getState(cards);
    setFeaturedCard(type);
    requestAnimationFrame(() => animateCard(state));
  });
  const profiles = [
    { type: "sun", color: "orange", level: "THE NOTE MAKER", title: "Every page has a purpose.", badge: "Verified note contributor", mark: "✎" },
    { type: "wave", color: "lime", level: "THE PAPER FINDER", title: "A past paper, passed on.", badge: "Helpful PYQ contributor", mark: "⌕" },
    { type: "star", color: "purple", level: "THE KIND CHECKER", title: "Good catches help us grow.", badge: "Community fact-checker", mark: "✓" },
  ];

  return (
    <section className="ed-section ed-hall" id="contributors">
      <div className="ed-section-inner">
        <Reveal className="ed-section-heading">
          <span className="ed-eyebrow"><span className="ed-eyebrow-dot" /> THE PEOPLE WHO PASS IT ON</span>
          <div className="ed-heading-row">
            <h2>Small share. <span>Big energy.</span></h2>
            <p>Real recognition for the real work students do for one another.</p>
          </div>
        </Reveal>
        <div className="ed-hall-grid" ref={gridRef}>
          {profiles.map((profile, index) => (
            <Reveal className={`ed-hall-reveal ed-hall-${profile.color}`} delay={index * 90} key={profile.type}>
              <article
                className={`ed-hall-card ed-hall-card-${profile.color}${featuredCard === profile.type ? " ed-is-featured" : ""}`}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setFeatured(null);
                }}
                onFocus={() => setFeatured(profile.type)}
                onPointerEnter={() => setFeatured(profile.type)}
                onPointerLeave={() => setFeatured(null)}
                ref={(element) => { cardRefs.current[index] = element; }}
                tabIndex={0}
              >
                <div className="ed-hall-topline"><span>{profile.level}</span><span aria-hidden="true">✦</span></div>
                <ContributorIllustration type={profile.type} />
                <div className="ed-hall-content">
                  <span className="ed-contributor-badge"><i>{profile.mark}</i>{profile.badge}</span>
                  <h3>{profile.title}</h3>
                  <div className="ed-contributor-stats">
                    <span><b>Notes</b><small>shared with care</small></span>
                    <span><b>Helpful</b><small>to the community</small></span>
                  </div>
                  <Link className="ed-hall-link" href="/register">Be part of the story <Arrow /></Link>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
        <p className="ed-hall-note"><span>✳</span> Recognition celebrates verified contributions. Points never unlock or limit free study resources.</p>
      </div>
    </section>
  );
}

function CtaMascot() {
  return (
    <div aria-label="Topper's mascot sharing an open notebook" className="ed-cta-mascot" role="img">
      <span className="ed-cta-star ed-cta-star-one">✳</span>
      <span className="ed-cta-star ed-cta-star-two">✦</span>
      <span className="ed-cta-note">YOU'VE GOT THIS!</span>
      <Mascot className="ed-mascot ed-mascot-cta" />
    </div>
  );
}

function EduRiseFooter({ apiStatus }) {
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    setShareUrl(encodeURIComponent(window.location.origin));
  }, []);
  const contactEmail = (process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "").trim();
  const validContactEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
    ? contactEmail
    : "";
  const shareText = encodeURIComponent(
    "Learn Together. Rise Together. Discover Topper, a free student resource-sharing community.",
  );
  return (
    <footer className="ed-footer" id="contact">
      <div aria-hidden="true" className="ed-footer-top-art"><span>✳</span><span>↗</span><span>✦</span></div>
      <div className="ed-footer-inner">
        <div className="ed-footer-main">
          <div className="ed-footer-brand">
            <Link aria-label="Topper home" href="/"><TopperLogo inverse /></Link>
            <p>Learn Together.<br /><span>Rise Together.</span></p>
            <span className="ed-footer-free">FREE TO LEARN · FREE TO SHARE</span>
          </div>
          <div className="ed-footer-links">
            <div><h2>Explore</h2><Link href="/search">Knowledge vault</Link><Link href="/syllabus">Syllabus explorer</Link></div>
            <div><h2>Join in</h2><Link href="/register">Share your notes</Link><Link href="/login">Student sign in</Link><Link href="/library">Your library</Link></div>
            <div><h2>About</h2><a href="#about">Our story</a><a href="#verification">Thoughtful verification</a><Link href="/terms">Terms &amp; conditions</Link></div>
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
          <span className="ed-api-status"><i />{apiStatus}</span>
          <a href="#top">Back to the top ↑</a>
        </div>
      </div>
    </footer>
  );
}

export default function EduRiseLanding() {
  const rootRef = useRef(null);
  const { user } = useAuth();
  const [apiStatus, setApiStatus] = useState("Connecting to the library…");
  const [menuOpen, setMenuOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const accountPath = user ? getPostLoginPath(user) : "/register";

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    api
      .get("/health")
      .then(({ data }) => {
        setApiStatus(
          data.database?.status === "connected"
            ? "Library is ready"
            : "Library is catching its breath",
        );
      })
      .catch(() => setApiStatus("Library connection unavailable"));
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  useGSAP(() => {
    const page = rootRef.current;
    const hero = page?.querySelector(".ed-hero");
    const heroCopy = page?.querySelector(".ed-hero-copy");
    const heroVisual = page?.querySelector(".ed-hero-visual");
    if (!page || !hero || !heroCopy || !heroVisual) return;

    const reducedMotion = prefersReducedMotion;
    const progress = page.querySelector(".ed-scroll-progress");
    const reveals = gsap.utils.toArray(
      ".ed-reveal:not(.ed-hero-copy):not(.ed-hero-visual)",
      page,
    );

    if (!reducedMotion) {
      page.classList.add("ed-gsap-ready");
      const marqueeTrack = page.querySelector(".ed-marquee-track");
      if (marqueeTrack) {
        const marqueeMotion = gsap.fromTo(
          marqueeTrack,
          { xPercent: 0 },
          {
            xPercent: -50,
            duration: 26,
            ease: "none",
            repeat: -1,
          },
        );
        ScrollTrigger.create({
          trigger: page,
          start: "top top",
          end: "bottom bottom",
          onUpdate: ({ direction }) => marqueeMotion.reversed(direction < 0),
        });
      }

      gsap.fromTo(
        hero.querySelector(".ed-hero-backdrop"),
        { clipPath: "inset(0 0 100% 0)" },
        { clipPath: "inset(0 0 0% 0)", duration: 1.15, ease: "power3.inOut" },
      );

      const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
      intro
        .fromTo(".ed-header-inner", { y: -22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.65 }, 0)
        .fromTo(".ed-hero-sticker", { scale: 0.7, rotation: -12, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.65 }, 0.28)
        .fromTo(heroCopy.querySelector(".ed-hero-kicker"), { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.55 }, 0.34)
        .fromTo(".ed-hero-word", { yPercent: 118, rotation: 3 }, { yPercent: 0, rotation: 0, duration: 0.82, stagger: 0.12, ease: "back.out(1.35)" }, 0.43)
        .fromTo(heroCopy.querySelector(":scope > p"), { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.65 }, 0.88)
        .fromTo(heroCopy.querySelectorAll(".ed-button"), { y: 20, scale: 0.92, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.7, stagger: 0.12, ease: "back.out(1.5)" }, 1.04)
        .fromTo(heroCopy.querySelector(".ed-hero-proof"), { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.55 }, 1.3)
        .fromTo(heroVisual, { scale: 0.84, rotation: 4, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: 1, duration: 1.05, ease: "back.out(1.25)" }, 0.48)
        .fromTo(".ed-hero-art > .ed-sticker, .ed-hero-art > .ed-pencil, .ed-hero-spark", { y: 18, rotation: -8, autoAlpha: 0 }, { y: 0, rotation: 0, autoAlpha: 1, duration: 0.65, stagger: 0.08 }, 0.92);

      gsap.to(".ed-mascot-float", {
        y: -8,
        rotation: 1.3,
        duration: 2.8,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
      gsap.to(".ed-paper-float", {
        y: -11,
        rotation: -2,
        duration: 3.4,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
      const svgMotion = gsap.matchMedia();
      svgMotion.add("(min-width: 761px)", () => {
        gsap.to(".ed-path-star", {
          duration: 8,
          ease: "none",
          repeat: -1,
          motionPath: {
            path: ".ed-motion-path",
            align: ".ed-motion-path",
            alignOrigin: [0.5, 0.5],
          },
        });
      });
      gsap.to(".ed-verification", {
        backgroundColor: "#7d5fd9",
        ease: "none",
        scrollTrigger: {
          trigger: ".ed-verification",
          start: "top bottom",
          end: "bottom top",
          scrub: 0.8,
        },
      });

      gsap.fromTo(
        ".ed-outcome",
        { scale: 0.82, rotation: -4, autoAlpha: 0 },
        {
          scale: 1,
          rotation: 0,
          autoAlpha: 1,
          duration: 0.55,
          stagger: 0.13,
          ease: "back.out(1.5)",
          scrollTrigger: {
            trigger: ".ed-outcomes",
            start: "top 88%",
            once: true,
          },
        },
      );

      gsap.fromTo(
        ".ed-scroll-progress",
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          scrollTrigger: {
            trigger: page,
            start: "top top",
            end: "bottom bottom",
            scrub: true,
          },
        },
      );

      reveals.forEach((element) => {
        const delay = Number(element.dataset.revealDelay || 0) / 1000;
        const visual = element.matches(".ed-verification-visual, .ed-final-cta-art");
        gsap.fromTo(
          element,
          visual
            ? { autoAlpha: 0, clipPath: "inset(8% 8% 8% 8% round 18px)", y: 28 }
            : { autoAlpha: 0, y: 30 },
          {
            autoAlpha: 1,
            clipPath: visual ? "inset(0% 0% 0% 0% round 0px)" : undefined,
            y: 0,
            duration: visual ? 0.95 : 0.75,
            delay,
            ease: visual ? "power3.out" : "power2.out",
            scrollTrigger: {
              trigger: element,
              start: "top 88%",
              once: true,
            },
          },
        );
      });

      gsap.fromTo(
        ".ed-paper-sheet",
        { rotation: -9, y: 32, scale: 0.94 },
        {
          rotation: 0,
          y: 0,
          scale: 1,
          duration: 1,
          ease: "back.out(1.3)",
          scrollTrigger: { trigger: ".ed-verification-art", start: "top 80%", once: true },
        },
      );

      gsap.fromTo(
        ".ed-scan-line",
        { y: 0, autoAlpha: 0.2 },
        {
          y: () => page.querySelector(".ed-paper-sheet").clientHeight * 0.58,
          autoAlpha: 0.9,
          duration: 2.7,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          scrollTrigger: {
            trigger: ".ed-verification-art",
            start: "top 85%",
            end: "bottom 15%",
            toggleActions: "play pause resume pause",
          },
        },
      );

      const stepMotion = gsap.matchMedia();
      stepMotion.add("(min-width: 1060px)", () => {
        const route = page.querySelector(".ed-step-route-path");
        if (!route) return undefined;
        const routeLength = route.getTotalLength();
        gsap.set(route, { strokeDasharray: routeLength, strokeDashoffset: routeLength });
        gsap.to(route, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: ".ed-steps",
            start: "top 80%",
            end: "bottom 55%",
            scrub: 0.7,
          },
        });
        gsap.to(".ed-step-route-star", {
          duration: 2.4,
          ease: "none",
          repeat: -1,
          motionPath: {
            path: route,
            autoRotate: false,
            align: route,
            alignOrigin: [0.5, 0.5],
          },
        });
        return undefined;
      });

      gsap.fromTo(
        ".ed-cta-orbit",
        { rotation: -12, scale: 0.85 },
        {
          rotation: 9,
          scale: 1.08,
          ease: "none",
          scrollTrigger: {
            trigger: ".ed-final-cta",
            start: "top bottom",
            end: "bottom top",
            scrub: 0.8,
          },
        },
      );
      gsap.fromTo(
        ".ed-cta-word",
        { yPercent: 115, rotation: 2 },
        {
          yPercent: 0,
          rotation: 0,
          duration: 0.76,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".ed-final-cta-copy",
            start: "top 78%",
            once: true,
          },
        },
      );

      const magneticMedia = gsap.matchMedia();
      magneticMedia.add("(hover: hover) and (pointer: fine) and (min-width: 761px)", () => {
        const buttons = gsap.utils.toArray(".ed-button", page);
        const quickX = buttons.map((button) => gsap.quickTo(button, "x", { duration: 0.35, ease: "power3.out" }));
        const quickY = buttons.map((button) => gsap.quickTo(button, "y", { duration: 0.35, ease: "power3.out" }));
        const moveHandlers = buttons.map((button, index) => {
          const handleMove = (event) => {
            const bounds = button.getBoundingClientRect();
            quickX[index]((event.clientX - bounds.left - bounds.width / 2) * 0.12);
            quickY[index]((event.clientY - bounds.top - bounds.height / 2) * 0.12);
          };
          const reset = () => {
            quickX[index](0);
            quickY[index](0);
          };
          button.addEventListener("pointermove", handleMove);
          button.addEventListener("pointerleave", reset);
          return () => {
            button.removeEventListener("pointermove", handleMove);
            button.removeEventListener("pointerleave", reset);
            gsap.set(button, { clearProps: "transform" });
          };
        });

        return () => moveHandlers.forEach((cleanup) => cleanup());
      });

      const heroMedia = gsap.matchMedia();
      heroMedia.add("(hover: hover) and (pointer: fine) and (min-width: 761px)", () => {
        const observer = Observer.create({
          target: hero,
          type: "pointer",
          onMove: (self) => {
            const event = self.event;
            if (!(event instanceof PointerEvent) || event.pointerType !== "mouse") return;
            const bounds = hero.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width - 0.5;
            const y = (event.clientY - bounds.top) / bounds.height - 0.5;
            gsap.to(heroVisual, { x: x * 10, y: y * 8, duration: 0.65, ease: "power2.out", overwrite: "auto" });
            gsap.to(".ed-orbit-one", { x: x * -13, y: y * -8, duration: 0.8, ease: "power2.out", overwrite: "auto" });
            gsap.to(".ed-orbit-two", { x: x * 17, y: y * 11, duration: 0.9, ease: "power2.out", overwrite: "auto" });
          },
          onStop: () => {
            gsap.to([heroVisual, ".ed-orbit-one", ".ed-orbit-two"], { x: 0, y: 0, duration: 0.7, ease: "power2.out" });
          },
        });
        return () => observer.kill();
      });

      const scrollStory = gsap.matchMedia();
      scrollStory.add("(min-width: 1060px) and (min-height: 720px)", () => {
        const section = page.querySelector(".ed-vault");
        const grid = page.querySelector(".ed-subject-grid");
        if (!section || !grid) return undefined;
        const travel = () => Math.max(0, grid.scrollWidth - grid.parentElement.clientWidth);
        if (!travel()) return undefined;
        const headerHeight = () => page.querySelector(".ed-header").offsetHeight;
        gsap.set(section, {
          height: () => Math.max(window.innerHeight - headerHeight(), section.scrollHeight) + travel(),
        });
        gsap.to(grid, {
          x: () => -travel(),
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: () => `+=${travel()}`,
            scrub: 0.8,
            invalidateOnRefresh: true,
          },
        });
        return undefined;
      });

      ScrollTrigger.refresh();
      requestAnimationFrame(() => ScrollTrigger.refresh());
    }

    if (reducedMotion) {
      gsap.set(progress, { scaleX: 0 });
      gsap.set(reveals, { clearProps: "all" });
      return;
    }

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => {
        if (page.contains(trigger.trigger)) trigger.kill();
      });
      page.classList.remove("ed-gsap-ready");
    };
  }, { scope: rootRef, dependencies: [prefersReducedMotion], revertOnUpdate: true });

  return (
    <main className="ed-site" id="top" ref={rootRef}>
      <div aria-hidden="true" className="ed-scroll-progress" />
      <svg aria-hidden="true" className="ed-motion-orbit" viewBox="0 0 100 100">
        <path className="ed-motion-path" d="M 50 4 C 85 4 96 24 96 50 C 96 77 78 96 50 96 C 22 96 4 77 4 50 C 4 22 22 4 50 4" fill="none" />
        <path className="ed-path-star" d="m50 0 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z" />
      </svg>
      {user ? <AuthenticatedSiteHeader user={user} /> : <header className="ed-header">
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
          <nav aria-label="Main navigation" className={`ed-nav ${menuOpen ? "ed-nav-open" : ""}`}>
            <Link href="/search" onClick={() => setMenuOpen(false)}>Explore</Link>
            <a href="#verification" onClick={() => setMenuOpen(false)}>How we check</a>
            <a href="#contributors" onClick={() => setMenuOpen(false)}>Our people</a>
            {user?.username && (
              <Link href={`/profile/${encodeURIComponent(user.username)}`} onClick={() => setMenuOpen(false)}>
                My profile
              </Link>
            )}
            {user && <NotificationBell />}
            <Link className="ed-nav-cta" href={accountPath} onClick={() => setMenuOpen(false)}>
              {user?.role === "admin" ? "Admin Dashboard" : user ? "My profile" : "Join for free"} <Arrow />
            </Link>
          </nav>
        </div>
      </header>}

      <section aria-labelledby="hero-heading" className="ed-hero" id="about">
        <div aria-hidden="true" className="ed-hero-backdrop" />
        <div aria-hidden="true" className="ed-hero-rays" />
        <div aria-hidden="true" className="ed-hero-sticker">GOOD NOTES<br />GO PLACES <span>↗</span></div>
        <div className="ed-hero-inner">
          <Reveal className="ed-hero-copy">
            <span className="ed-hero-kicker"><i /> A STUDENT-POWERED KNOWLEDGE CLUB</span>
            <h1 id="hero-heading">
              <span className="ed-word-mask"><span className="ed-hero-word">LEARN</span></span><br />
              <span className="ed-word-mask"><span className="ed-hero-word">TOGETHER.</span></span><br />
              <span className="ed-word-mask ed-rise-mask"><span className="ed-hero-word ed-hero-rise">RISE</span></span>{" "}
              <span className="ed-word-mask"><span className="ed-hero-word">TOGETHER<span className="ed-hero-period">.</span></span></span>
            </h1>
            <p>Your notes can help someone learn. Discover, share and grow with <b>Topper.</b></p>
            <div className="ed-hero-actions">
              <ButtonLink className="ed-hero-primary" href="/search" kind="dark">Explore resources</ButtonLink>
              <ButtonLink className="ed-hero-secondary" href={user ? "/uploads" : "/register"} kind="paper">Share your notes</ButtonLink>
            </div>
            <div className="ed-hero-proof">
              <span><i>✓</i> Always free to learn</span>
              <span><i>✳</i> Made for sharing</span>
            </div>
          </Reveal>
          <Reveal className="ed-hero-visual" delay={140}>
            <HeroNotebook />
          </Reveal>
        </div>
        <a className="ed-hero-scroll" href={user ? "#explore" : "#verification"}>
          <span>{user ? "SCROLL TO EXPLORE" : "SCROLL TO LEARN"}</span><i>↓</i>
        </a>
        <span aria-hidden="true" className="ed-hero-edge">TOPPER · LEARN TOGETHER · RISE TOGETHER ·</span>
      </section>

      <div className="ed-marquee" aria-label="A good note can change everything">
        <div className="ed-marquee-track">
          {Array.from({ length: 2 }, (_, index) => (
            <span aria-hidden={index === 1 ? "true" : undefined} className="ed-marquee-copy" key={index}>
              <b>LEARN</b><i>✦</i><b>SHARE</b><i>✦</i><b>EXPLORE</b><i>✦</i><b>GROW</b><i>✦</i><b>RISE</b><i>✦</i>
            </span>
          ))}
        </div>
      </div>

      {user && <SubjectVault />}

      <AdUnit className="ed-ad-slot" placement="home" />

      <VerificationSection />

      <HowItWorks />

      <HallOfFame />

      <section className="ed-final-cta" id="share">
        <div aria-hidden="true" className="ed-cta-orbit" />
        <div aria-hidden="true" className="ed-cta-scribble ed-cta-scribble-one">✳</div>
        <div aria-hidden="true" className="ed-cta-scribble ed-cta-scribble-two">↗</div>
        <div className="ed-final-cta-inner">
          <Reveal className="ed-final-cta-copy">
            <span className="ed-eyebrow"><span className="ed-eyebrow-dot" /> YOUR NEXT CHAPTER STARTS HERE</span>
            <h2>
              <span className="ed-word-mask"><span className="ed-cta-word">YOUR</span></span>{" "}
              <span className="ed-word-mask"><span className="ed-cta-word">NOTES</span></span>{" "}
              <span className="ed-word-mask"><span className="ed-cta-word">CAN</span></span>{" "}
              <span className="ed-word-mask"><span className="ed-cta-word">HELP</span></span><br />
              <span className="ed-word-mask"><span className="ed-cta-word">SOMEONE</span></span>{" "}
              <span className="ed-word-mask"><span className="ed-cta-word ed-cta-rise">RISE.</span></span>
            </h2>
            <p>One upload can make somebody else’s hard chapter click.</p>
            <div className="ed-hero-actions">
              <ButtonLink className="ed-cta-dark" href={accountPath} kind="dark">
                {user?.role === "admin" ? "Admin dashboard" : user ? "My profile" : "Join Topper"}
              </ButtonLink>
              <ButtonLink className="ed-cta-paper" href="/search" kind="paper">Explore resources</ButtonLink>
            </div>
          </Reveal>
          <Reveal className="ed-final-cta-art" delay={130}>
            <CtaMascot />
          </Reveal>
        </div>
      </section>

      <EduRiseFooter apiStatus={apiStatus} />
    </main>
  );
}
