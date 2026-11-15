import Lenis from "lenis";
import { gsap, ScrollTrigger } from "./gsap.js";

export function startSmoothScroll() {
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let lenis;
  let ticker;

  const stopLenis = () => {
    if (!lenis) return;
    lenis.off("scroll", ScrollTrigger.update);
    gsap.ticker.remove(ticker);
    lenis.destroy();
    lenis = undefined;
    ticker = undefined;
    gsap.ticker.lagSmoothing(500, 33);
  };

  const startLenis = () => {
    if (motionPreference.matches || lenis) return;
    lenis = new Lenis({
      anchors: true,
      autoRaf: false,
      lerp: 0.1,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1,
    });
    lenis.on("scroll", ScrollTrigger.update);
    ticker = (time) => lenis?.raf(time * 1000);
    gsap.ticker.add(ticker);
    gsap.ticker.lagSmoothing(0);
  };

  const syncMotionPreference = () => {
    if (motionPreference.matches) stopLenis();
    else startLenis();
  };

  syncMotionPreference();
  motionPreference.addEventListener("change", syncMotionPreference);
  return () => {
    motionPreference.removeEventListener("change", syncMotionPreference);
    stopLenis();
  };
}
