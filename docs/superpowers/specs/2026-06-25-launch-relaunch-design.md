# Underroot site relaunch — "It's live" (Direction B)

**Date:** 2026-06-25
**Repo:** `underroot-website` (marketing site, `underroot.se`)
**Status:** Approved, ready for implementation plan

## Context

Underroot launched today. The game is live and browser-playable at **play.underroot.se**.
The marketing site's `index.html` is currently a pre-launch page: an animated falling-tile
"COMING SOON..." headline, a countdown to 2026-06-25, a Formspree email-capture ("Get
notified at launch"), and "Watch Story" / "Music" buttons over a fixed background.

The background art (`Underroot_website_background.png` / `_mobile.png`) already contains the
large **UNDERROOT** logo and the tagline *"WHEN THE HORIZON MOVED, WE DUG."* baked in — so
the page does not need to re-state the title in text.

This spec is **Direction B** (a proper game-homepage flip). The larger scrollable marketing
page (Direction C — screenshots, feature sections, footer) is explicitly deferred to a near-future
follow-up and is **out of scope** here.

## Goal

Flip `index.html` from "coming soon / get notified" to "it's live / play now" with the
smallest, highest-confidence change that still feels like a real game homepage. Preserve the
signature falling-tile animation, particles, background art, and music.

## Scope

Only `index.html` changes. `story.html`, `music.html`, assets, and music are untouched.

### Keep (unchanged behavior)
- Falling-tile pixel-font animation engine (tiles fall, flash white on landing).
- Background-particle field.
- Desktop + mobile background images and their media query.
- Background music with the bottom-center mute/unmute toggle and autoplay-resume handlers.
- `Watch Story` (`story.html`) and `Music` (`music.html`) links.
- Favicon, fonts (`Press Start 2P` + Georgia), the overall dark tile aesthetic.

### Change
1. **Headline tiles:** spell **`PLAY NOW`** instead of `COMING SOON...`.
   - Desktop: single line `PLAY NOW`.
   - Narrow (`< 600px`): two lines `PLAY` / `NOW` (mirrors the existing `COMING`/`SOON` split).
   - Requires adding pixel-font glyphs for the new letters: **P, L, A, Y, W** (font already has N, O).
     Remove now-unused glyphs only if convenient; leaving them is fine.
   - `CHAR_COLORS_BY_INDEX` is re-tuned to the new letter count so colors still cycle across
     the material palette.

2. **Remove the countdown** entirely — markup, styles, `updateCountdown`/`setInterval`,
   `TARGET` date, and its slot in `updateOverlayPositions`.

3. **Primary CTA — hero Play button:** a prominent **`▶ Play Free in Browser`** button linking
   to `https://play.underroot.se`, placed directly under the tile headline. Styled like the
   existing CTA pills but larger and accented with the dark-red Maw color
   (`rgba(140,40,40,…)`) plus a soft glow. Opens in the same tab (it's the destination).

4. **Secondary link row** (below the Play button), reusing the existing `#cta-btns` styling:
   - `▷ Watch Story` → `story.html`
   - `♪ Music` → `music.html`
   - `itch.io` → **muted "soon" chip** (dashed border, dimmed, non-clickable, `· soon` suffix).
   - `Downloads` → **muted "soon" chip**, same treatment.
   The two "soon" chips are visually distinct (`.soon` class) and carry no link target yet.
   When itch.io goes live they become real anchors (`href` + remove `.soon`); desktop downloads
   will be hosted on itch.io alongside the web build (decided: **not** Google Drive).

5. **Email form → bug/feedback form:** repurpose the existing Formspree integration
   (action `https://formspree.io/f/mgoqyvqp`) into a compact **"Found a bug? Tell us."**
   inline form: a short message field (and optional email), an unobtrusive submit, and the
   existing success/error message line. Reuses the current submit handler (fetch → JSON,
   show confirmation, reset on success). Sits low in the hero, below the link row.

### Out of scope
- Direction C (scrollable sections, screenshots/GIFs, feature blocks, footer).
- Any change to `story.html`, `music.html`, music tracks, or image assets.
- Standing up real itch.io / desktop-download destinations (tracked separately; chips ship as "soon").
- Wishlist/Steam, social links, analytics.

## Layout & positioning

The overlay stack stays vertically centered in the open valley region of the art, below the
baked-in logo. `updateOverlayPositions()` is simplified: it currently positions
`#countdown`, `#email-section`, `#cta-btns` relative to the tile baseline. After the change it
positions the **Play button**, then the **link row**, then the **bug form**, in that order,
spaced off the bottom of the tile headline. Mute button stays `position: fixed` bottom-center.

All sizing stays responsive via the existing `clamp()` patterns and the `resize` rebuild
(`resize()` → `buildTiles()` → `initParticles()`), debounced as today.

## Data flow / interactions

- **Tiles:** unchanged engine. Only the source strings (`getLines()`), the glyph table
  (`PIXEL_FONT`), and the per-index color array change. No timing/animation changes.
- **Play button:** plain anchor navigation to `play.underroot.se`. No JS.
- **Bug form:** existing async submit handler, unchanged logic, pointed at the same Formspree
  endpoint; only the form fields and surrounding copy change.
- **Audio:** unchanged. Note the existing autoplay-resume attaches a one-time document click
  handler; verify it does not swallow the first click on the new Play button / form (it calls
  `bgm.play()` and removes itself — it does not `preventDefault`, so navigation/submit still work).

## Error handling

- Bug form: reuse current try/catch — on non-OK or network error, show
  "Something went wrong — please try again."; on success, show a short confirmation and reset.
- Missing glyphs: `PIXEL_FONT[ch] ?? PIXEL_FONT[' ']` fallback already guards unknown letters,
  so a typo degrades to blank tiles rather than crashing.

## Testing / verification

No automated harness (static site). Manual checks:
1. Serve `index.html` locally; confirm tiles animate and spell `PLAY NOW`, flashing on landing.
2. Resize below 600px: headline splits to `PLAY` / `NOW`; mobile background loads; layout stays centered.
3. Click **Play Free in Browser** → navigates to `play.underroot.se`.
4. `Watch Story` / `Music` links work; `itch.io` / `Downloads` render as dimmed non-clickable "soon" chips.
5. Submit the bug form (valid + empty) → success and error states render; music keeps playing.
6. Music autoplay/mute toggle behave as before; first click on Play/form is not swallowed.
7. No console errors; countdown code fully removed (no dangling references).

## Risks / notes

- The biggest fiddly bit is hand-authoring 5×5 glyphs for P, L, A, Y, W to match the existing
  font weight. Low risk, just careful pixel work.
- Keep the diff confined to `index.html` so it's easy to review and revert.
