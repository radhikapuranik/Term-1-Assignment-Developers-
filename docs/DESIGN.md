# Design concept: "The Pulse"

**One sentence.** The product is called Pulse, so the page has a heartbeat: a hand-drawn pulse line draws itself across the top of the page, and its spikes rise over the categories whose mentions are rising. It is generated in code from the real statistics in the database. It is never a stock graphic.

**Who it is for.** Sumit, the only PM, has ten seconds on a Friday morning. The page must give him the answer in the first screen, then let him dig into evidence. Beauty must never hide a number, slow the page or make data harder to read.

## What we learned from the references (ideas only, nothing copied)

- **GSAP homepage:** very large, chunky display type; one loud accent colour against a calm field; pill-shaped controls; playful motion that is localised, not everywhere; lots of empty space.
- **fps ecosystem (Awwwards nominee):** type-led layout with a hand-drawn gesture mixed into a precise grid; colour used as a signal.
- What we took: type-led hierarchy, one highlighter colour, a few hand-drawn gestures, parallax kept to decoration. What we did not take: any layout, text, icon, illustration or animation file.

## Type pairing

| Role | Face | Where |
|---|---|---|
| Display | **Bricolage Grotesque** (variable, `next/font`) | Hero headline and big section titles only |
| Text | **IBM Plex Sans** | Everything readable: paragraphs, tables, buttons |
| Data | **IBM Plex Mono** | Numbers, labels, source badges, chips (tabular figures) |

Hero set very large and tight with balanced wrapping. Real numbers sit inline inside the headline. Running text stays near 65 characters wide.

## Colour tokens

Light and dark sets follow the system setting, with an optional manual switch.

| Token | Light | Dark |
|---|---|---|
| background | `#F7F8FA` | `#0B0F14` |
| surface | `#FFFFFF` | `#121820` |
| ink | `#0F1720` | `#E7ECF2` |
| muted | `#5B6675` | `#93A1B3` |
| hairline | `#E3E7ED` | `#212A36` |
| accent | `#2457D6` | `#7AA2FF` |
| **highlighter (new)** | `#FFD84D` | `#E0B400` |
| rising | `#C2410C` | `#FB923C` |
| falling | `#15803D` | `#4ADE80` |
| flat | `#64748B` | `#94A3B8` |
| new | `#0369A1` | `#38BDF8` |
| incomplete | `#A16207` | `#FACC15` |

The page is colourful because the data is: trend colours appear on chips, bars and pulse spikes. The highlighter is only for hand-drawn marks and underlines. No gradients, blobs or emoji. Colour is never the only signal: every trend chip also has an arrow icon and a word.

## Layout

A 12-column grid, 24 px gutters, generous whitespace, left-aligned. Big type makes the hierarchy, not boxes. Cards are used only where a unit of content needs a boundary (the three "10 seconds" blocks are separated by hairlines, not boxes). Everything works from 360 px up; tables become stacked rows on phones.

## Motion principles (GSAP)

1. **Meaning first.** Motion explains something (a number arriving, a line being drawn, a run progressing) or it is decoration that can disappear without loss.
2. **Never move what you need to read or click.** Tables, paragraphs, buttons and status banners never slide, fade or parallax. Section *headers*, hand-drawn marks and chart ink animate. Data cells count up in place and bars grow from zero.
3. **Short and consistent.** Every animation is under 0.8 s, with one easing family (`power3.out` for arrivals, `power2.inOut` for draws).
4. **Parallax is decoration only,** off on phones.
5. **Safe by default.** Everything is inside `gsap.matchMedia`. With "reduce motion" the page is fully static and fully readable. Content is visible in the server HTML. A CSS fallback reveals anything still hidden after 3 seconds, so a slow script never hides content. No layout shift: animated elements only change transform, opacity or stroke.
6. **Smooth scrolling:** we use **ScrollTrigger only, not ScrollSmoother.** ScrollSmoother wraps the page in a transformed container, which breaks `position: sticky` (our section navigation) and fixed overlays (the Run now panel).

## The 5 signature moments

1. **The pulse line.** The hero line draws itself in about 0.8 s; spikes over rising categories light up in their trend colour in sequence. The same line sits (smaller) in the sticky navigation, and the spike for the category you are reading lights up as its table row scrolls into view.
2. **The hand-drawn gestures.** A squiggle underline under the hero keyword, a circle drawn around the biggest-riser number, and an arrow annotation such as "1.3x last week" computed from the real counts.
3. **This week in 10 seconds.** Biggest riser, biggest faller and the most important potentially unresolved discussion, each with its number, trend chip, one line of explanation and an evidence link. Numbers count up once.
4. **Run now as a story.** A progress panel with the real pipeline stages (Fetching sources, Counting, Analysing with Gemini, Writing the brief, Sending the email), polled every 2 seconds from the database. It ends with a hand-drawn checkmark, or a plain-English error with a Retry button.
5. **Every number explains itself.** Hover, focus or tap a number to see how it was counted: the window dates, the sources, and "unique posts, deduplicated by source and ID".

## Microinteractions

Magnetic pull and press feedback on buttons; a soft expand on table rows; chips and evidence links lift on hover; "Copied" confirmation; smooth theme change; designed focus rings; a skip-to-content link; sticky section navigation with scroll-spy that collapses to a compact bar on phones.

## Rules we keep

Every figure on screen comes from the database. Nothing is invented for visuals. No autoplay sound, no hidden or custom cursor, no video or 3D. Gemini still never produces a number or a link.

## As built, and how it was checked

**What shipped.** The hero (display headline with real numbers inline, squiggle under "struggling", pulse line generated from the stored statistics), a "This week in 10 seconds" block (biggest riser with a circled number and an arrow annotation such as "1.2x last week" computed from the counts, biggest faller, most important potentially unresolved discussion), sticky navigation with scroll-spy and a small copy of the pulse line, the Run now progress story, number explanations on hover, focus and tap, and an optional light/dark switch. When a source is down, the headline says "Trends unavailable, data incomplete" instead of claiming "0 rising", and the pulse line goes flat with amber dots.

**Decisions.**
- ScrollTrigger only, no ScrollSmoother (it would break the sticky navigation and the fixed Run now panel and tooltips).
- All motion lives in one lazily loaded module so GSAP never delays first paint; every animation sits inside `gsap.matchMedia`, so "reduce motion" gives a fully static page; parallax is off below 721 px.
- Section headers fade and rise; tables, paragraphs, buttons and banners never move. Buttons have a very small magnetic pull (pointer devices only).
- The hero numbers are static (they do not count up) so the first thing you read is never briefly wrong. Other numbers count up once in place and always end on the server-rendered text.
- The page is pre-rendered HTML (refreshed every minute and after every run), with no loading screen in front of it, so it is fully readable with JavaScript off.
- The tables stack into cards below 900 px (pain points) and 720 px (keywords, history).

**Measured on the live URL (https://developer-community-pulse.vercel.app).**

| | Performance | Accessibility | Best Practices | SEO | LCP | Layout shift |
|---|---|---|---|---|---|---|
| Mobile (3 runs) | 97, 98, 99 | 100 | 100 | 100 | 2.0 to 2.5 s | 0 |
| Desktop (2 runs) | 100 | 100 | 100 | 100 | 0.4 to 0.5 s | 0 |

- **Keyboard walkthrough** (scripted, `scripts/a11y-check.mts`): skip link, 60 consecutive tab stops all with a visible focus ring, theme switch, table row expand, number explanation and Escape, Copy brief ("Copied"), Run now, navigation with scroll-spy: all pass.
- **axe (WCAG A and AA, including contrast):** 0 violations in light and dark, at 1440 px and 360 px.
- **Overflow:** none at 320, 360, 414, 600, 768, 899, 901, 1024, 1280 and 1920 px.
- **Numbers:** after a fresh real run, every category, keyword and total on the redesigned page matches the database (`scripts/verify-numbers.mts`).
- **Screenshots** in `docs/screenshots/`: data, empty and partial-failure states at 360, 768 and 1440 px in light and dark; the Run now panel (form, wrong passcode, stages, done); reduced motion, no JavaScript and slow network runs on the live site.

**Two critique-and-improve rounds (what changed because of them).**
1. Round 1: count-up numbers were stuck at 0 after a React double-run (fixed: the server text is the source of truth); the squiggle was broken by dash-drawing and non-scaling strokes; a decorative shape landed on the status chip; the sticky navigation was see-through over table text; sparklines were flat lines (now scaled to their own range); the nav pulse line was a meaningless wobble (given its own proportions); on phones the pulse line shrank to nothing (given its own phone shape).
2. Round 2: the pain table overflowed at tablet width (stacks below 900 px); the navigation highlighted a section while still at the top; the hero said "0 rising" when trends were actually unavailable; with JavaScript off the page showed only a skeleton (loading boundary removed); a font-preload tweak caused a layout shift on desktop (reverted and re-measured).
