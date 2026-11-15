import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "./gsap.js";

gsap.registerPlugin(useGSAP);

export function usePageMotion(rootRef, { dependencies = [] } = {}) {
  useGSAP((context, contextSafe) => {
    const root = rootRef.current;
    if (!root) return undefined;

    const motion = gsap.matchMedia();
    motion.add(
      {
        reduce: "(prefers-reduced-motion: reduce)",
        desktop: "(min-width: 900px)",
        hover: "(hover: hover) and (pointer: fine)",
      },
      ({ conditions }) => {
        if (conditions.reduce) return undefined;

        const distance = conditions.desktop ? 18 : 10;
        const introItems = root.querySelectorAll("[data-motion-intro]");
        if (introItems.length) {
          gsap.timeline({ defaults: { ease: "power3.out" } }).fromTo(
            introItems,
            { autoAlpha: 0, y: distance },
            { autoAlpha: 1, y: 0, duration: 0.58, stagger: 0.07 },
          );
        }

        root.querySelectorAll("[data-motion-avatar]").forEach((avatar) => {
          gsap.fromTo(
            avatar,
            { autoAlpha: 0, scale: 0.78, rotation: -7 },
            { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.72, delay: 0.12, ease: "back.out(1.5)" },
          );
        });
        const avatarCleanups = [];
        if (conditions.hover) {
          root.querySelectorAll("[data-motion-avatar]").forEach((avatar) => {
            const enter = contextSafe(() => gsap.to(avatar, {
              scale: 1.035,
              rotation: 2,
              duration: 0.32,
              ease: "power2.out",
              overwrite: "auto",
            }));
            const leave = contextSafe(() => gsap.to(avatar, {
              scale: 1,
              rotation: 0,
              duration: 0.38,
              ease: "power3.out",
              overwrite: "auto",
            }));
            avatar.addEventListener("pointerenter", enter);
            avatar.addEventListener("pointerleave", leave);
            avatarCleanups.push(() => {
              avatar.removeEventListener("pointerenter", enter);
              avatar.removeEventListener("pointerleave", leave);
            });
          });
        }

        root.querySelectorAll("[data-motion-count]").forEach((counter) => {
          const value = Number(counter.textContent.replaceAll(",", ""));
          if (!Number.isFinite(value)) return;
          const count = { value: 0 };
          gsap.to(count, {
            value,
            duration: 0.9,
            ease: "power2.out",
            onUpdate: () => {
              counter.textContent = Math.round(count.value).toLocaleString();
            },
          });
        });

        const groups = new Set(
          [...root.querySelectorAll("[data-motion-stagger]")].map((item) => item.parentElement),
        );
        groups.forEach((group) => {
          if (!group) return;
          const items = [...group.children].filter((item) =>
            item.hasAttribute("data-motion-stagger"),
          );
          for (let index = 0; index < items.length; index += 6) {
            const batch = items.slice(index, index + 6);
            gsap.fromTo(
              batch,
              { autoAlpha: 0, y: distance },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.52,
                stagger: 0.055,
                ease: "power2.out",
                scrollTrigger: {
                  trigger: batch[0],
                  start: "top 90%",
                  once: true,
                },
              },
            );
          }
        });

        root.querySelectorAll("[data-motion-scroll], [data-ed-animate], tbody tr").forEach((item) => {
          if (
            item.hasAttribute("data-motion-stagger") ||
            item.parentElement?.closest("[data-motion-stagger]")
          ) return;
          gsap.fromTo(
            item,
            { autoAlpha: 0, y: distance },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.55,
              ease: "power2.out",
              scrollTrigger: {
                trigger: item,
                start: "top 90%",
                once: true,
              },
            },
          );
        });

        const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
        return () => {
          cancelAnimationFrame(refreshFrame);
          avatarCleanups.forEach((cleanup) => cleanup());
        };
      },
    );

    return () => motion.revert();
  }, { scope: rootRef, dependencies, revertOnUpdate: true });
}
