import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../lib/gsap.js";
import illustration from "../assets/topper-loading-mascot.webp";

gsap.registerPlugin(useGSAP);

export default function FlyingStudentsMascot({ className = "" }) {
  const rootRef = useRef(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const image = root.querySelector("img");

    if (!image) return;

    // Main flying animation: Bottom-left to Top-right
    const media = gsap.matchMedia();

    media.add(
      {
        mobile: "(max-width: 640px)",
        desktop: "(min-width: 641px)",
      },
      (context) => {
        const { mobile } = context.conditions;
        const bounds = image.getBoundingClientRect();
        const loader = root.closest(".ed-page-loader");
        const copyHeight = loader?.querySelector(".ed-loader-copy")?.getBoundingClientRect().height ?? 0;
        const travelX = Math.min(
          mobile ? 70 : 180,
          Math.max(0, (window.innerWidth - bounds.width) / 2 - (mobile ? 22 : 36)),
        );
        const travelY = Math.min(
          mobile ? 70 : 140,
          Math.max(0, (window.innerHeight - bounds.height - copyHeight - 8) / 2 - 12),
        );

        gsap.fromTo(
          image,
          {
            x: -travelX,
            y: travelY,
            rotation: -2,
          },
          {
            x: travelX,
            y: -travelY,
            rotation: 2,
            duration: 1,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
          }
        );
      }
    );

    return () => media.revert();

  }, { scope: rootRef });

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`ed-flying-students-mascot ${className}`}
    >
      <img alt="" decoding="async" draggable="false" height="768" src={illustration.src} width="1151" />
    </div>
  );
}