"use client";

import { useEffect, useRef } from "react";

const maxPoints = 44;
const ribbonWidth = 22;
const smoothing = 0.28;
const opacity = 0.85;
const idleDuration = 1100;
const ribbonColor = "146, 112, 232";

function listenToMediaChange(mediaQuery, listener) {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }
  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
}

export default function CursorRibbon() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return undefined;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointerPreference = window.matchMedia("(hover: hover) and (pointer: fine)");
    const points = [];
    let mouseX = 0;
    let mouseY = 0;
    let headX = 0;
    let headY = 0;
    let lastPointerMove = 0;
    let frameId = 0;
    let initialized = false;
    let listening = false;

    function resizeCanvas() {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * pixelRatio);
      canvas.height = Math.round(window.innerHeight * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    function clearRibbon() {
      points.length = 0;
      initialized = false;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }

    function drawRibbon(timestamp) {
      frameId = 0;
      headX += (mouseX - headX) * smoothing;
      headY += (mouseY - headY) * smoothing;
      points.push({ x: headX, y: headY });
      if (points.length > maxPoints) points.shift();

      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (points.length >= 4) {
        const left = [];
        const right = [];

        for (let index = 1; index < points.length; index += 1) {
          const previous = points[index - 1];
          const current = points[index];
          const deltaX = current.x - previous.x;
          const deltaY = current.y - previous.y;
          const distance = Math.hypot(deltaX, deltaY) || 1;
          const normalX = -deltaY / distance;
          const normalY = deltaX / distance;
          const progress = index / (points.length - 1);
          const width = Math.sin(progress * Math.PI) * ribbonWidth * 0.5
            + progress * ribbonWidth * 0.18;

          left.push([current.x + normalX * width, current.y + normalY * width]);
          right.push([current.x - normalX * width, current.y - normalY * width]);
        }

        context.beginPath();
        context.moveTo(left[0][0], left[0][1]);
        for (let index = 1; index < left.length; index += 1) {
          context.lineTo(left[index][0], left[index][1]);
        }
        for (let index = right.length - 1; index >= 0; index -= 1) {
          context.lineTo(right[index][0], right[index][1]);
        }
        context.closePath();

        const gradient = context.createLinearGradient(
          points[0].x,
          points[0].y,
          points[points.length - 1].x,
          points[points.length - 1].y,
        );
        gradient.addColorStop(0, `rgba(${ribbonColor}, ${opacity})`);
        gradient.addColorStop(1, `rgba(${ribbonColor}, ${opacity})`);
        context.fillStyle = gradient;
        context.fill();
      }

      if (timestamp - lastPointerMove < idleDuration) {
        frameId = window.requestAnimationFrame(drawRibbon);
      } else {
        clearRibbon();
      }
    }

    function handlePointerMove(event) {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      mouseX = event.clientX;
      mouseY = event.clientY;
      lastPointerMove = performance.now();
      if (!initialized) {
        headX = mouseX;
        headY = mouseY;
        initialized = true;
      }
      if (!frameId) frameId = window.requestAnimationFrame(drawRibbon);
    }

    function updateAvailability() {
      const enabled = !motionPreference.matches && pointerPreference.matches;
      if (enabled && !listening) {
        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        listening = true;
      } else if (!enabled && listening) {
        window.removeEventListener("pointermove", handlePointerMove);
        listening = false;
        clearRibbon();
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) clearRibbon();
    }

    resizeCanvas();
    updateAvailability();
    window.addEventListener("resize", resizeCanvas, { passive: true });
    window.addEventListener("blur", clearRibbon);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const removeMotionListener = listenToMediaChange(motionPreference, updateAvailability);
    const removePointerListener = listenToMediaChange(pointerPreference, updateAvailability);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("blur", clearRibbon);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      removeMotionListener();
      removePointerListener();
      clearRibbon();
    };
  }, []);

  return <canvas aria-hidden="true" className="ed-cursor-ribbon" ref={canvasRef} />;
}
