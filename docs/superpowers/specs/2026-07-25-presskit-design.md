# Press Kit page — design spec

**Date:** 2026-07-25
**Status:** Approved pending spec review
**Deliverable:** A new `presskit.html` page giving press, curators, and content creators a single place to grab Underroot's assets, facts, and approved copy.

## Goal

Provide the standard press-kit contents described in the Underroot docs: logo, key art, screenshots, trailer, fact sheet, and boilerplate — plus a way to request extras. Everything downloadable individually and as one ZIP.

## Non-goals

- No CMS, build step, or new dependencies. The site is static, hand-authored HTML; this page follows suit.
- No new backend. Press contact reuses the existing Formspree endpoint.
- No redesign of existing pages beyond adding one footer link.

## Conventions to match (from `index.html`)

- Self-contained page: single inline `<style>` block, no shared stylesheet.
- Palette via `:root` vars: `--bg #14100c`, `--panel #1b1611`, `--ink rgba(255,255,255,.88)`, `--muted rgba(255,255,255,.52)`, `--red #8c2828`, `--clay #a36936`, `--line rgba(255,255,255,.10)`, `--maxw 1080px`.
- `font-family: 'Georgia', serif`; `Press Start 2P` (Google Fonts) for small pixel accents only.
- Section header pattern: `.kicker.center` (uppercase, letter-spaced, muted) above `h2.title`.
- Favicon link, `lang="en"`, viewport meta, `<meta name="description">`.
- Footer identical to the homepage footer, with **Press** added to `.foot-links`.

## Page structure (`presskit.html`)

1. **Header**
   - Kicker "Press Kit" → `h1` "Underroot Press Kit".
   - The approved one-liner: *"Every layer buys time. Underroot is an idle survival-crafter about digging deep to keep a doomed village alive one more day."*
   - Primary button: **⬇ Download all assets (.zip)** → `assets/press/underroot-press-kit.zip` (styled like the homepage `#play-cta`, `download` attribute).

2. **Fact sheet** — `<dl>` card (`--panel` background, `--line` border). Rows:
   | Field | Value |
   |---|---|
   | Title | Underroot |
   | Tagline | Every layer buys time. |
   | Developer | Swavvy AB |
   | Genre | Idle / incremental survival-crafter, with base-defense and light colony-management |
   | Platforms | Play free in the browser, or download for PC (Windows and Linux) |
   | Price | Free / name-your-own-price (pay what you want) |
   | Engine | Godot 4 |
   | Players | Single-player |
   | Release | Launching on itch.io — playable free in browser, downloadable for Windows and Linux |
   | Website | [underroot.se](https://underroot.se) |

3. **Boilerplate** — kicker "Boilerplate" / title "Use these as-is." Two styled quote blocks:
   - **One-liner** (the sentence above).
   - **About paragraph** (verbatim from the docs, Swavvy AB, Maw, lineage, free-in-browser/PC).
   - Each block has a **Copy** button that writes the exact text to the clipboard (`navigator.clipboard.writeText`) with a transient "Copied" state. Text remains selectable if the clipboard API is unavailable.

4. **Assets** — kicker "From the deep" / title "Assets". Responsive grid of tiles; each tile = thumbnail + label + **Download** link (`download` attribute, direct file href):
   - **Logo** — `assets/images/Underroot_title.png` (stone wordmark, transparent; shown on a dark tile so it reads).
   - **Key art** — `assets/images/Underroot_website_background.png` (village above, deep below, the Maw at the edge).
   - **Screenshots** — the six files in `assets/images/shots/` (`shot_world`, `shot_dig`, `shot_dig2`, `shot_village`, `shot_craft`, `shot_rain`), each with the caption already used on the homepage gallery.
   - **Trailer** — inline `<video>` with `underroot_trailer_poster.jpg` poster + a **Download .mp4** link to `assets/video/underroot_trailer.mp4`.

5. **Contact / on request** — kicker "Press & creators" / title "Need something else?". Short paragraph: coverage/streams/videos welcome; specific resolutions, extra captures, or the trailer file for embedding are available on request. A minimal form reusing `https://formspree.io/f/mgoqyvqp` (POST, `Accept: application/json`), with a hidden `_subject` / tag field marking submissions as `[Press]` so they're distinguishable from bug reports. Same async submit + status-message UX as the homepage bug form.

6. **Footer** — copy of the homepage footer (Play button, links, legal line).

## ZIP bundle

- Path: `assets/press/underroot-press-kit.zip`, committed to the repo (static asset).
- Contents:
  - `Underroot_title.png` (logo)
  - `Underroot_website_background.png` (key art)
  - `shots/` — the six screenshots
  - `underroot_trailer.mp4` (trailer)
  - `fact-sheet.txt` — the fact-sheet fields above, plain text
  - `boilerplate.txt` — one-liner + about paragraph, plain text
- A small committed helper script (`scripts/build-presskit-zip.*`) documents how the ZIP is regenerated when assets change, so it isn't a mystery binary. The script is not run at deploy time.

## Wiring

- Add `<a href="presskit.html">Press</a>` to the `.foot-links` in `index.html` (between Stats and EULA).
- No other pages change.

## Verification

- Serve locally and load `presskit.html`; confirm no console errors, all images and the trailer poster resolve, the logo reads on its tile.
- Click each individual **Download** link → correct file downloads.
- Click **Download all** → the ZIP downloads and unzips to the listed contents.
- Click a **Copy** button → clipboard holds the exact approved text.
- Submit the contact form → Formspree accepts it; success message shows.
- Check responsive layout at mobile width and confirm the footer **Press** link works from the homepage.

## Open items

None. Logo asset (`Underroot_title.png`) confirmed present.
