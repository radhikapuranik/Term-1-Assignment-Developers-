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
