# Underroot site — full landing page (Direction C)

**Date:** 2026-06-28
**Repo:** `underroot-website` (marketing site, `underroot.se`)
**Status:** Approved (copy locked), ready to build
**Follows:** `2026-06-25-launch-relaunch-design.md` (Direction B, shipped)

## Context

Direction B flipped the homepage to "play now": a single full-viewport hero with the
falling-tile `PLAY NOW` animation, a Play-in-Browser CTA, story/music links, "soon" chips,
and a bug-report form. Direction C grows that into a full **long-scroll game landing page**
(structure option A) so a cold visitor understands and wants the game.

The relaunch **hero stays as section 1**; everything else is new content scrolling below it.
Existing `story.html` and `music.html` are unchanged and linked from the new Story & Music
section + footer.

## Goal

A scannable, share-and-SEO-friendly landing page that sells Underroot, reusing the established
aesthetic (tile palette, Georgia + Press Start 2P, dark-red `rgba(140,40,40)` accent), built
mobile-first, verified in the preview.

## Page structure (top → bottom, all in `index.html`)

1. **Hero** — the shipped B hero, unchanged, sized to `100vh`. Add a subtle "scroll for more"
   cue at the bottom. (See "Hero refactor" risk below.)
2. **The pitch / About** — the locked pitch paragraph over a dark band.
3. **Three feature pillars** — full-bleed paintings, text alternating side, locked copy:
   - Dig & refine — `assets/images/Underground.png`
   - Raise a village — `assets/images/The_Village.png`
   - Hold back the Maw — `assets/images/The_Maw.png`
   - Closing line under the pillars (late-game hooks): *"Weather storms, dare the Terrestrial
     Astrolabe to reseed the world with exotic materials at a terrible price, and pick up right
     where you left off."*
4. **Screenshot gallery** — responsive grid of 6 in-game shots with click-to-zoom lightbox.
   Images provided by Mike later; build with graceful placeholders keyed to the filenames below.
5. **Story & Music** — two cards linking to `story.html` and `music.html` (reuse a story panel
   image + a music-themed visual).
6. **Footer** — Play CTA, "A Swavvy AB game", links to `eula.html` + `privacy.html`, current
   year. **No social links** (none yet).

## Locked copy (verbatim — do not paraphrase)

**Pitch (section 2):**
> Underroot is an idle survival-digger. A creature called the Maw is coming from the east
> devouring everything in its way — it can't be killed, only slowed. Alone with a shovel, you
> begin digging down through shifting layers of rock, smelting what you find into better tools
> and machines. As you forage food, water, fulfill villager tasks and build a stronger wall to
> stop the Maw, your village grows from a mere 47 souls to a mighty fortress! But beware, the
> Maw grows hungrier by the day, learning from what it consumes... What materials will you
> create, what mysteries will you uncover, and how long will you last? Every layer buys time!

**Pillar 1 — Dig & refine:**
> Carve down through stone, coal, iron, copper and quartz — and rarer veins still. Fuel drills
> and excavators on coal, oil or ethanol, and smelt raw ore into bars, alloys, glass and cement.
> Keep an eye out for glowing tiles — water pockets, gold caches, fossils, and the exotic
> materials the deep keeps hidden.

**Pillar 2 — Raise a village:**
> Turn ore into a home. Keep food and water flowing — wells, pumps and caches against the drain
> — while your elders judge food, shelter and safety each morning. Keep them happy and people
> arrive; every 50 souls is a milestone, grow your village enough and they will sing of your
> greatness! The Village scout will visit to trade, deal in gold, and wager on rare finds.

**Pillar 3 — Hold back the Maw:**
> You can't kill the Maw — only slow it. It chews faster every day and learns the walls you
> raise, so stack and mix your defenses, from dirt and stone up to steel, glass and vault block.
> Strange roots are said to also have mystical effects. And should your digger die, your
> bloodline can dig on — generation after generation.

## Assets

- **Pillar paintings** — already in repo: `Underground.png`, `The_Village.png`, `The_Maw.png`.
- **Gallery shots** — provided by Mike, captured from save slot_1 ("Eir", 49 pop / depth 208 /
  4 buildings / 4 machines), game windowed at native 1280×720. Drop into
  `assets/images/shots/` as: `shot_world.png`, `shot_dig.png`, `shot_village.png`,
  `shot_maw.png`, `shot_craft.png`, `shot_moment.png` (last optional). Page ships with
  placeholders so it builds before the shots exist; images appear when files are added.
- **Story/Music cards** — reuse a story panel (`underroot_story_*.png`) and a music visual.
- **Legal pages** — `eula.html` + `privacy.html`, content copied from the game repo's
  `EULA.txt` / `PRIVACY.txt`, wrapped in a minimal styled page matching the site.

## Interactions & behavior

- Single document; native smooth scroll (`scroll-behavior: smooth`); hero "scroll" cue anchors
  to section 2.
- **Reveal-on-scroll:** subtle fade/slide-up via `IntersectionObserver` (respect
  `prefers-reduced-motion` — no transforms when set).
- **Gallery lightbox:** click a thumb → full-size overlay; close on click/Esc. Vanilla JS,
  no library.
- **Lazy-load** gallery + pillar images (`loading="lazy"`) for fast first paint.
- Mobile-first; pillars stack vertically, gallery collapses to 1–2 columns, footer wraps.

## Hero refactor (main risk)

Today `index.html` is a fixed full-screen experience: `html,body { overflow:hidden }`, a
`position:absolute` full-window `<canvas>`, and overlay elements positioned in JS against the
canvas. To allow scrolling:

- Wrap the hero (canvas + tiles overlay + Play CTA + links + bug form + mute) in a
  `#hero` section sized `100vh`; remove `overflow:hidden` from `html,body`.
- Scope the canvas to the hero (fixed/absolute within `#hero`, not the whole document) so it
  doesn't bleed over lower sections; size it to the hero box, not `window.innerHeight`, and
  update the resize handler accordingly.
- Keep the mute button anchored within/below the hero (or promote to a small fixed control) so
  it doesn't float over scrolled content.
- Verify the falling-tile + particle animation still lays out correctly when the canvas is
  hero-scoped, and that `updateOverlayPositions()` still measures against the hero box.

Confine the diff to `index.html` plus the two new legal pages. Preserve all B behavior.

## Verification

Static site, no automated harness. In preview (restart server fresh before each screenshot —
the hero's rAF loop makes screenshots hang otherwise):
1. Hero renders + animates exactly as B; "scroll for more" cue visible; page scrolls.
2. Each section renders with correct locked copy; pillars alternate sides on desktop, stack on mobile.
3. Gallery placeholders render; lightbox opens/closes (click + Esc); real images appear when added.
4. Story/Music cards link correctly; footer links open `eula.html` / `privacy.html`.
5. Mobile (≤600px): hero splits PLAY/NOW, sections stack, nothing overflows or overlaps.
6. `prefers-reduced-motion`: reveal animations disabled.
7. No console errors; legal pages load and are readable.

## Out of scope

- Animated GIF/video loops (possible later as muted .webm).
- Wiring the itch.io / Downloads "soon" chips (tracked separately).
- Any gameplay/screenshot capture (Mike provides shots) and any save-file generation.
