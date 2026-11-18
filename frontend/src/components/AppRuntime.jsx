"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiPageLoader,
  PageLoader,
  RouteNavigationLoader,
} from "./PageState.jsx";
import CursorRibbon from "./CursorRibbon.jsx";
import {
  hasCompletedMainIntro,
  markMainIntroCompleted,
  resetMainIntroForDocument,
} from "../lib/loading-session.js";

export default function AppRuntime() {
  const [introPhase, setIntroPhase] = useState("booting");
  const [routeNavigationPending, setRouteNavigationPending] = useState(false);
  const completeIntroAnimation = useCallback(() => {
    setIntroPhase((phase) => (phase === "entering" ? "exiting" : phase));
  }, []);
  const completeIntroExit = useCallback(() => {
    markMainIntroCompleted();
    setIntroPhase("done");
  }, []);

  useEffect(() => {
    resetMainIntroForDocument();
    setIntroPhase(hasCompletedMainIntro() ? "done" : "entering");
  }, []);

  useEffect(() => {
    if (introPhase === "booting" || introPhase === "done") return undefined;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const transitionDelay =
      introPhase === "entering"
        ? prefersReducedMotion ? 100 : 1200
        : 450;
    const timer = window.setTimeout(
      introPhase === "entering" ? completeIntroAnimation : completeIntroExit,
      transitionDelay,
    );
    return () => window.clearTimeout(timer);
  }, [completeIntroAnimation, completeIntroExit, introPhase]);

  useEffect(() => {
    let active = true;
    let stopSmoothScroll;
    import("../lib/smoothScroll.js").then(({ startSmoothScroll }) => {
      if (active) stopSmoothScroll = startSmoothScroll();
    });
    return () => {
      active = false;
      stopSmoothScroll?.();
    };
  }, []);

  return (
    <>
      <CursorRibbon />
      <RouteNavigationLoader onPendingChange={setRouteNavigationPending} />
      <ApiPageLoader suppressed={routeNavigationPending} />
      {introPhase !== "booting" && introPhase !== "done" && (
        <PageLoader
          exiting={introPhase === "exiting"}
          fullScreen
          label="Welcome to Topper…"
          onAnimationComplete={completeIntroAnimation}
          onExitComplete={completeIntroExit}
        />
      )}
    </>
  );
}
