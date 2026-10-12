import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const EASE_IN = "power3.out"; // arrivals
const EASE_DRAW = "power2.inOut"; // line drawing

/**
 * All page motion. Loaded lazily (after the page is already visible) so GSAP never blocks first paint.
 * Everything is inside gsap.matchMedia:
 * - reduced motion: nothing runs, the page stays fully static and readable;
 * - parallax only on screens wider than 720px.
 * ScrollTrigger only, not ScrollSmoother: ScrollSmoother wraps the page in a transformed container, which
 * breaks position: sticky (section navigation) and fixed overlays (Run now panel, tooltips).
 * Rules: tables, paragraphs, buttons and banners never slide or fade. Section headers, hand-drawn marks and
 * chart ink animate; numbers count up in place and bars grow from zero.
 */
export function startMotion(rootEl: HTMLElement): () => void {
  let mm: gsap.MatchMedia | undefined;
  const ctx = gsap.context(() => {
      mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = <T extends Element>(sel: string) => gsap.utils.toArray<T>(sel, rootEl);
        const once = (el: Element, start = "top 90%") => ({ trigger: el, start, once: true });

        // Hero: lines slide up (translate only, so the headline is visible and paints immediately).
        gsap.from(q(".hero-line"), { y: "0.45em", duration: 0.7, ease: EASE_IN, stagger: 0.08 });

        // Hero pulse line draws itself, then its spikes pop in colour, in sequence.
        q<SVGGeometryElement>('[data-draw="hero"]').forEach((el) => {
          const isMini = !!el.closest(".mini-pulse");
          gsap.to(el, { strokeDashoffset: 0, duration: isMini ? 0.8 : 0.8, ease: EASE_DRAW, delay: isMini ? 0.4 : 0.15 });
        });
        q<SVGGeometryElement>('[data-draw="squiggle"]').forEach((el) =>
          gsap.to(el, { strokeDashoffset: 0, duration: 0.6, ease: EASE_DRAW, delay: 0.5 }),
        );
        q(".pulse .dot").forEach((el, i) =>
          gsap.fromTo(el, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2.2)", delay: 0.55 + (i % 8) * 0.09, clearProps: "transform" }),
        );

        // Section headers: soft fade-and-rise, once.
        q("[data-reveal]").forEach((el) => gsap.to(el, { opacity: 1, y: 0, duration: 0.7, ease: EASE_IN, scrollTrigger: once(el) }));

        // Hand-drawn marks and chart ink draw in when they scroll into view.
        q<SVGGeometryElement>('[data-draw="scroll"]').forEach((el) =>
          gsap.to(el, { strokeDashoffset: 0, duration: 0.8, ease: EASE_DRAW, scrollTrigger: once(el, "top 92%") }),
        );

        // Numbers count up once, in place. The server-rendered text is kept in data-final and always restored,
        // so a second run (React strict mode, route refresh) can never leave a wrong number on screen.
        const counted: Array<{ node: Node; final: string }> = [];
        q<HTMLElement>("[data-count]").forEach((el) => {
          const node = el.firstChild;
          if (!node || node.nodeType !== 3) return;
          if (el.dataset.final === undefined) el.dataset.final = node.nodeValue ?? "";
          const final = el.dataset.final;
          const target = parseFloat(el.dataset.count ?? "");
          if (Number.isNaN(target)) return;
          const dec = Number(el.dataset.decimals ?? 0);
          const pre = el.dataset.prefix ?? "";
          const suf = el.dataset.suffix ?? "";
          const o = { v: 0 };
          counted.push({ node, final });
          node.nodeValue = `${pre}${(0).toFixed(dec)}${suf}`;
          gsap.to(o, {
            v: target, duration: 0.8, ease: "power2.out", scrollTrigger: once(el, "top 94%"),
            onUpdate: () => { node.nodeValue = `${pre}${o.v.toFixed(dec)}${suf}`; },
            onComplete: () => { node.nodeValue = final; },
          });
        });

        // Bars grow from zero.
        q("[data-bar]").forEach((el) => gsap.fromTo(el, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: EASE_IN, scrollTrigger: once(el, "top 94%") }));

        // The spike for the category being read lights up in the pulse line.
        q<HTMLElement>("[data-pulse-row]").forEach((row) => {
          const category = row.dataset.pulseRow ?? null;
          ScrollTrigger.create({
            trigger: row, start: "top 60%", end: "bottom 60%",
            onToggle: (self) => { if (self.isActive) window.dispatchEvent(new CustomEvent("pulse:focus", { detail: { category } })); },
          });
          row.addEventListener("mouseenter", () => window.dispatchEvent(new CustomEvent("pulse:focus", { detail: { category } })));
        });

        // Magnetic pull on buttons (subtle, pointer devices only).
        const fine = window.matchMedia("(pointer: fine)").matches;
        const quick = new WeakMap<Element, { x: (v: number) => void; y: (v: number) => void }>();
        const move = (e: PointerEvent) => {
          const b = (e.target as Element | null)?.closest?.(".btn") as HTMLButtonElement | null;
          if (!b || b.disabled) return;
          let f = quick.get(b);
          if (!f) { f = { x: gsap.quickTo(b, "x", { duration: 0.4, ease: EASE_IN }) as (v: number) => void, y: gsap.quickTo(b, "y", { duration: 0.4, ease: EASE_IN }) as (v: number) => void }; quick.set(b, f); }
          const r = b.getBoundingClientRect();
          f.x(Math.max(-6, Math.min(6, (e.clientX - (r.left + r.width / 2)) * 0.18)));
          f.y(Math.max(-4, Math.min(4, (e.clientY - (r.top + r.height / 2)) * 0.22)));
        };
        const leave = (e: PointerEvent) => {
          const b = (e.target as Element | null)?.closest?.(".btn");
          const f = b && quick.get(b);
          if (f) { f.x(0); f.y(0); }
        };
        if (fine) {
          document.addEventListener("pointermove", move);
          document.addEventListener("pointerout", leave);
        }

        document.fonts?.ready.then(() => ScrollTrigger.refresh());
        return () => {
          counted.forEach((c) => { c.node.nodeValue = c.final; });
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerout", leave);
        };
      });

      // Parallax and trailing ("data-speed", "data-lag"): decoration only, never on phones.
      mm.add("(min-width: 721px) and (prefers-reduced-motion: no-preference)", () => {
        const hero = rootEl.querySelector(".hero");
        if (!hero) return;
        gsap.utils.toArray<HTMLElement>("[data-speed]", rootEl).forEach((el) => {
          const speed = parseFloat(el.dataset.speed ?? "0.3");
          const lag = parseFloat(el.dataset.lag ?? "0");
          gsap.to(el, {
            y: -speed * 260, ease: "none",
            scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: lag > 0 ? lag : true },
          });
        });
      });

  }, rootEl);
  return () => { mm?.revert(); ctx.revert(); };
}
