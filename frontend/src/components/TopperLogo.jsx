"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../lib/gsap.js";

gsap.registerPlugin(useGSAP);

export default function TopperLogo({ inverse = false, size = "default", loading = false }) {
  const rootRef = useRef(null);
  const svgRef = useRef(null);

  const { contextSafe } = useGSAP(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    if (!root || !svg) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return undefined;

    const strokes = [...svg.querySelectorAll("[data-logo-stroke]")];
    const cap = svg.querySelector("[data-logo-cap]");
    const book = svg.querySelector('path:not([data-logo-cap]):not([data-logo-page])');
    const pages = [...svg.querySelectorAll("[data-logo-page]")];
    const word = root.querySelector("[data-logo-word]");
    const accent = svg.querySelector("[data-logo-accent]");
    const details = [...svg.querySelectorAll("circle")];

    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    if (loading) {
      strokes.forEach((path) => {
        gsap.set(path, { drawSVG: "0%" });
      });
      gsap.set(strokes.filter((element) => element.tagName.toLowerCase() === "path"), {
        fillOpacity: 0,
      });
      gsap.set(cap, { y: -8, rotation: -5, transformOrigin: "50% 50%" });
      gsap.set(pages, { y: 4, transformOrigin: "50% 100%" });
      gsap.set(word, { autoAlpha: 0, y: 5 });
      gsap.set([accent, ...details], {
        autoAlpha: 0,
        scale: 0,
        transformOrigin: "50% 50%",
      });

      intro
        .to(cap, {
          drawSVG: "100%",
          duration: 0.58,
          ease: "power2.inOut",
        })
        .to(cap, { fillOpacity: 1, duration: 0.2 }, "-=0.08")
        .to(cap, { y: 0, rotation: 0, duration: 0.42, ease: "back.out(1.7)" }, "-=0.08")
        .to(book, { drawSVG: "100%", duration: 0.48, ease: "power2.inOut" }, "-=0.2")
        .to(
          pages,
          { drawSVG: "100%", duration: 0.4, stagger: 0.11, ease: "power2.inOut" },
          "-=0.12",
        )
        .to(
          pages,
          { fillOpacity: 1, y: 0, duration: 0.28, stagger: 0.1, ease: "power3.out" },
          "-=0.08",
        )
        .to(
          strokes.filter((element) => element !== cap && element !== book && !pages.includes(element)),
          { drawSVG: "100%", duration: 0.32, stagger: 0.06, ease: "power2.inOut" },
          "-=0.18",
        )
        .to(word, { autoAlpha: 1, y: 0, duration: 0.4 }, "-=0.12")
        .to(
          [accent, ...details],
          { autoAlpha: 1, scale: 1, duration: 0.28, stagger: 0.08, ease: "back.out(2)" },
          "-=0.14",
        );

      gsap.to(svg.querySelector("[data-logo-float]"), {
        y: -1.5,
        duration: 2.8,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: 2.4,
      });
      return undefined;
    }

    strokes.forEach((path) => {
      const length = path.getTotalLength();
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
    });
    gsap.set(cap, {
      autoAlpha: 0,
      y: -7,
      rotation: -5,
      transformOrigin: "50% 50%",
    });
    gsap.set(pages, {
      autoAlpha: 0,
      y: 4,
      transformOrigin: "50% 100%",
    });
    gsap.set(word, { autoAlpha: 0, y: 5 });
    gsap.set(accent, {
      autoAlpha: 0,
      scale: 0,
      transformOrigin: "50% 50%",
    });

    intro
      .to(cap, {
        autoAlpha: 1,
        y: 0,
        rotation: 0,
        duration: 0.48,
        ease: "back.out(1.7)",
      })
      .to(
        pages,
        { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.09 },
        "-=0.16",
      )
      .to(strokes, { strokeDashoffset: 0, duration: 0.6, stagger: 0.06, ease: "power2.inOut" }, "-=0.2")
      .to(word, { autoAlpha: 1, y: 0, duration: 0.42 }, "-=0.3")
      .to(accent, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.35,
        ease: "back.out(2)",
      }, "-=0.16");

    gsap.to(svg.querySelector("[data-logo-float]"), {
      y: -1.5,
      duration: 2.8,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
      delay: 2.2,
    });

    return undefined;
  }, { scope: rootRef });

  const handlePointerEnter = contextSafe(() => {
    if (loading) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const svg = svgRef.current;
    const word = rootRef.current?.querySelector("[data-logo-word]");
    gsap.timeline({ defaults: { duration: 0.32, ease: "power2.out", overwrite: "auto" } })
      .to(svg?.querySelector("[data-logo-cap]"), { y: -2, rotation: -3, transformOrigin: "50% 50%" })
      .to(svg?.querySelectorAll("[data-logo-page]"), { rotation: (index) => (index ? 2 : -2), stagger: 0.04 }, 0)
      .to(word, { x: 2 }, 0);
  });

  const handlePointerLeave = contextSafe(() => {
    if (loading) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.to([
      svgRef.current?.querySelector("[data-logo-cap]"),
      ...svgRef.current?.querySelectorAll("[data-logo-page]") ?? [],
      rootRef.current?.querySelector("[data-logo-word]"),
    ], {
      y: 0,
      x: 0,
      rotation: 0,
      duration: 0.38,
      ease: "power3.out",
      overwrite: "auto",
    });
  });

  return (
    <span
      className={`ed-brand${inverse ? " ed-brand-inverse" : ""}${size === "large" ? " ed-brand-large" : ""}`}
      onBlur={handlePointerLeave}
      onFocus={handlePointerEnter}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      ref={rootRef}
    >
      <svg
        aria-hidden="true"
        className="ed-brand-mark"
        fill="none"
        ref={svgRef}
        viewBox="0 0 56 50"
      >
        <g data-logo-float>
          <path
            d="M5 18.5 28 7l23 11.5L28 30 5 18.5Z"
            fill="#9270E8"
            stroke="#171717"
            strokeLinejoin="round"
            strokeWidth="2.4"
            data-logo-cap
            data-logo-stroke
          />
          <path
            d="M12 23v10.5c5.5-2.7 10.8-2.2 16 1.8 5.2-4 10.5-4.5 16-1.8V23"
            fill="#FFF8EB"
            stroke="#171717"
            strokeLinejoin="round"
            strokeWidth="2.3"
            data-logo-stroke
          />
          <path
            d="M13 29.5c5.2-2 10.2-.9 15 3.2v11c-4.8-3.7-9.8-4.8-15-3.2v-11Z"
            fill="#C8EF16"
            stroke="#171717"
            strokeLinejoin="round"
            strokeWidth="2.2"
            data-logo-page
            data-logo-stroke
          />
          <path
            d="M43 29.5c-5.2-2-10.2-.9-15 3.2v11c4.8-3.7 9.8-4.8 15-3.2v-11Z"
            fill="#FFF8EB"
            stroke="#171717"
            strokeLinejoin="round"
            strokeWidth="2.2"
            data-logo-page
            data-logo-stroke
          />
          <path d="M51 18.5v13" stroke="#171717" strokeLinecap="round" strokeWidth="2" data-logo-stroke />
          <circle cx="51" cy="34" r="2.7" fill="#FFD943" stroke="#171717" strokeWidth="1.5" />
          <path
            d="m6 7 1.4 3.1L11 11.5l-3.6 1.4L6 16l-1.4-3.1L1 11.5l3.6-1.4L6 7Z"
            fill="#FF641F"
            stroke="#171717"
            strokeLinejoin="round"
            strokeWidth="1.2"
            data-logo-accent
          />
          <path d="M28 34v9" stroke="#171717" strokeLinecap="round" strokeWidth="1.8" data-logo-stroke />
        </g>
      </svg>
      <span data-logo-word>Top<span>per</span></span>
    </span>
  );
}

