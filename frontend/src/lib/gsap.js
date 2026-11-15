import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { Observer } from "gsap/Observer";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(DrawSVGPlugin, Flip, MotionPathPlugin, Observer, ScrollTrigger);

export { DrawSVGPlugin, Flip, MotionPathPlugin, Observer, ScrollTrigger, gsap };
