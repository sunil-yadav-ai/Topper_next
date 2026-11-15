import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../lib/gsap.js";

gsap.registerPlugin(useGSAP);

function IllustrationArtwork({ variant }) {
  if (variant === "search") {
    return (
      <>
        <path d="M12 15V8.5a3 3 0 0 1 3-3h14l7 7V28" fill="#FFF8EB" stroke="#171717" strokeLinejoin="round" strokeWidth="2.4" data-art-stroke />
        <path d="M29 5.5v7h7M17 17h8m-8 5h6" stroke="#171717" strokeLinecap="round" strokeWidth="2.2" data-art-stroke />
        <circle cx="34" cy="31" r="8" fill="#C8EF16" stroke="#171717" strokeWidth="2.4" data-art-stroke data-art-lens />
        <path d="m40 37 6 6" stroke="#171717" strokeLinecap="round" strokeWidth="3" data-art-stroke />
        <path d="m9 31 1.2 2.8L13 35l-2.8 1.2L9 39l-1.2-2.8L5 35l2.8-1.2L9 31Z" fill="#FF641F" />
      </>
    );
  }

  if (variant === "upload") {
    return (
      <>
        <path d="M12 35h29a8 8 0 0 0 .4-16 12 12 0 0 0-22.8-2.8A9.5 9.5 0 0 0 12 35Z" fill="#FFF8EB" stroke="#171717" strokeLinejoin="round" strokeWidth="2.5" data-art-stroke data-art-cloud />
        <path d="M27 34V19m-6 6 6-6 6 6" stroke="#9270E8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" data-art-stroke data-art-arrow />
        <path d="m45 8 1.2 2.8L49 12l-2.8 1.2L45 16l-1.2-2.8L41 12l2.8-1.2L45 8Z" fill="#FF641F" data-art-spark />
        <circle cx="12" cy="43" r="2" fill="#FFD943" data-art-spark />
      </>
    );
  }

  if (variant === "success") {
    return (
      <>
        <circle cx="28" cy="28" r="21" fill="#C8EF16" stroke="#171717" strokeWidth="2.4" data-art-stroke data-art-badge />
        <path d="m17 28 7 7 15-16" stroke="#171717" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" data-art-stroke data-art-check />
        <path d="m8 7 1.1 2.6L12 11l-2.9 1.2L8 15l-1.1-2.8L4 11l2.9-1.4L8 7Z" fill="#FF641F" data-art-spark />
        <path d="m47 38 .9 2.1L50 41l-2.1.9L47 44l-.9-2.1L44 41l2.1-.9L47 38Z" fill="#9270E8" data-art-spark />
      </>
    );
  }

  if (variant === "notification") {
    return (
      <>
        <path d="M8 16a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V16Z" fill="#FFF8EB" stroke="#171717" strokeLinejoin="round" strokeWidth="2.5" data-art-stroke data-art-envelope />
        <path d="m9 15 19 15 19-15" stroke="#9270E8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" data-art-stroke data-art-flap />
        <circle cx="43" cy="10" r="5" fill="#FF641F" stroke="#171717" strokeWidth="1.8" data-art-spark />
      </>
    );
  }

  if (variant === "profile") {
    return (
      <>
        <circle cx="28" cy="18" r="10" fill="#FFD943" stroke="#171717" strokeWidth="2.4" data-art-stroke data-art-head />
        <path d="M9 47c1.8-10 8.6-15 19-15s17.2 5 19 15H9Z" fill="#9270E8" stroke="#171717" strokeLinejoin="round" strokeWidth="2.4" data-art-stroke data-art-body />
        <path d="m45 6 1.1 2.6L49 10l-2.9 1.2L45 14l-1.1-2.8L41 10l2.9-1.4L45 6Z" fill="#FF641F" data-art-spark />
      </>
    );
  }

  return (
    <>
      <path d="M6 17c7-3 14-2 22 3v23c-8-5-15-6-22-3V17Z" fill="#C8EF16" stroke="#171717" strokeLinejoin="round" strokeWidth="2.5" data-art-stroke data-art-page />
      <path d="M50 17c-7-3-14-2-22 3v23c8-5 15-6 22-3V17Z" fill="#FFF8EB" stroke="#171717" strokeLinejoin="round" strokeWidth="2.5" data-art-stroke data-art-page />
      <path d="M12 25c4-1.5 8-.8 12 1.5m-12 5c4-1.5 8-.8 12 1.5m18-8c-4-1.5-8-.8-12 1.5m12 5c-4-1.5-8-.8-12 1.5" stroke="#9270E8" strokeLinecap="round" strokeWidth="2" data-art-stroke />
      <path d="m28 3 2 4.5 5 2-5 2-2 5-2-5-5-2 5-2 2-4.5Z" fill="#FF641F" stroke="#171717" strokeLinejoin="round" strokeWidth="1.3" data-art-spark />
    </>
  );
}

export default function AnimatedIllustration({
  variant = "book",
  className = "",
  size = 72,
  label,
}) {
  const svgRef = useRef(null);

  useGSAP(() => {
    const svg = svgRef.current;
    if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const outlines = [...svg.querySelectorAll("[data-art-stroke]")];
    outlines.forEach((path) => {
      const length = path.getTotalLength();
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
    });

    const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });
    timeline
      .fromTo(svg.querySelectorAll("[data-art-spark]"), { autoAlpha: 0, scale: 0.3 }, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.35,
        stagger: 0.07,
        transformOrigin: "50% 50%",
        ease: "back.out(1.7)",
      }, 0)
      .to(outlines, { strokeDashoffset: 0, duration: 0.65, stagger: 0.06, ease: "power2.inOut" }, 0.05);

    const floatTarget = svg.querySelector("[data-art-page], [data-art-cloud], [data-art-envelope], [data-art-badge], [data-art-head]");
    if (floatTarget) {
      gsap.to(floatTarget, {
        y: -2,
        duration: 2.6,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: 0.75,
      });
    }

    if (variant === "search") {
      gsap.to(svg.querySelector("[data-art-lens]"), {
        scale: 1.06,
        transformOrigin: "50% 50%",
        duration: 1.35,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: 0.8,
      });
    }
    if (variant === "upload") {
      gsap.to(svg.querySelector("[data-art-arrow]"), {
        y: -3,
        duration: 0.9,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: 0.8,
      });
    }
  }, { scope: svgRef });

  return (
    <svg
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      className={`ed-animated-illustration ed-illustration-${variant} ${className}`}
      fill="none"
      height={size}
      ref={svgRef}
      role={label ? "img" : undefined}
      viewBox="0 0 56 56"
      width={size}
    >
      <IllustrationArtwork variant={variant} />
    </svg>
  );
}
