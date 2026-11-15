"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../lib/gsap.js";
import {
  getPendingPageRequestCount,
  subscribeToPageRequests,
} from "../lib/page-request-tracker.js";
import AnimatedIllustration from "./AnimatedIllustration.jsx";
import FlyingStudentsMascot from "./FlyingStudentsMascot.jsx";
import TopperLogo from "./TopperLogo.jsx";

gsap.registerPlugin(useGSAP);

export function PageLoader({
  label = "Preparing your learning space…",
  fullScreen = false,
  exiting = false,
  onExitComplete,
  onAnimationComplete,
  className = "",
}) {
  const rootRef = useRef(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const progress = root.querySelector(".ed-loader-progress-indicator");

    if (exiting) {
      gsap.to(root, {
        autoAlpha: 0,
        scale: 0.985,
        duration: reduceMotion ? 0.01 : 0.36,
        ease: "power2.inOut",
        onComplete: onExitComplete,
      });
      return undefined;
    }

    if (reduceMotion) {
      if (fullScreen && onAnimationComplete) {
        const completion = gsap.delayedCall(0, onAnimationComplete);
        return () => completion.kill();
      }
      return undefined;
    }

    const entrance = gsap.timeline({
      defaults: { ease: "power3.out" },
      ...(fullScreen && onAnimationComplete
        ? { onComplete: onAnimationComplete }
        : {}),
    });
    if (fullScreen) {
      entrance
        .fromTo(root.querySelector(".ed-loader-mascot"), { y: 14, scale: 0.94, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.6 })
        .fromTo(root.querySelector(".ed-loader-copy"), { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45 }, "-=0.16");
      gsap.to(progress, {
        xPercent: 280,
        duration: 1.25,
        ease: "power2.inOut",
        repeat: -1,
        repeatDelay: 0.16,
      });
    } else {
      entrance.fromTo(root.querySelector(".ed-loader-inline-logo"), { y: 5, autoAlpha: 0.7 }, {
        y: 0,
        autoAlpha: 1,
        duration: 0.45,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }
    return undefined;
  }, {
    scope: rootRef,
    dependencies: [exiting, fullScreen, onAnimationComplete, onExitComplete],
    revertOnUpdate: true,
  });

  if (fullScreen) {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className={`ed-page-loader ed-page-loader-fullscreen ${className}`}
        ref={rootRef}
        role="status"
      >
        <FlyingStudentsMascot className="ed-loader-mascot" />
        <div className="ed-loader-copy">
          <p className="ed-loader-kicker">TOPPER · LEARN TOGETHER</p>
          <span>{label}</span>
          <div aria-hidden="true" className="ed-loader-progress-track">
            <span className="ed-loader-progress-indicator" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div aria-busy="true" aria-live="polite" className={`ed-page-loader ed-page-loader-inline ${className}`} ref={rootRef} role="status">
      <div className="ed-loader-inline-logo"><TopperLogo loading /></div>
      <span>{label}</span>
    </div>
  );
}

function useDelayedVisibility(active, delay = 200) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [active, delay]);

  return visible;
}

export function ApiPageLoader() {
  const requestCount = useSyncExternalStore(
    subscribeToPageRequests,
    getPendingPageRequestCount,
    () => 0,
  );
  const visible = useDelayedVisibility(requestCount > 0);

  if (!visible) return null;
  return <PageLoader className="ed-api-page-loader" label="Loading your page…" />;
}

export function EmptyState({ title, children, icon = "book", illustration, className = "" }) {
  const variant = illustration ?? "book";
  return (
    <section className={`ed-empty-state ${className}`} data-ed-animate>
      <span className={`ed-empty-illustration ed-empty-${icon}`}>
        <AnimatedIllustration variant={variant} size={66} />
      </span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </section>
  );
}

