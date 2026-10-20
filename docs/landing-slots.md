# Landing page slots

The landing page (`src/app/page.tsx`) is laid out after the structure of shift5.io: a split hero, a status panel, a draggable row of solutions, a platform section, and a full-screen menu. Anywhere a video, illustration or component belongs but has not been supplied, the page shows a named, hatched placeholder (`src/components/landing/Slot.tsx`) that says what goes there and in what shape.

## Filling a slot

Put the file at `public/landing/slots/<name>.<ext>` and pass it to the slot:

```tsx
<Slot name="solution-fleet" kind="illustration" ratio="4 / 3" note="…" src="/landing/slots/solution-fleet.svg" alt="A fleet of batteries" />
```

- `kind="video"` renders a muted, looping, autoplaying video (decorative, so give it no alt).
- Any other kind with `src` renders an image; give it an `alt`.
- Children win over `src`: pass a component (as `platform-twin` does) to put something live in the slot.
- The ratio is the shape the layout reserves. Supply media in that ratio and nothing else moves.
- Do not caption an image as a photograph of Synovra equipment unless it is. Drawings are captioned as drawings.

## The slots

Every slot is filled. The four solution drawings are SVG components in `src/components/landing/SolutionArt.tsx`, drawn for this page: flat and hard-edged, charcoal on paper with signal orange for the one thing to look at, mono capitals for labels, hatching (never colour alone) for "watching" and "not recorded". Each says "ILLUSTRATION · SYNTHETIC" and its numbers are invented. A supplied picture can replace any of them: pass it as `src` on the `Slot` and drop the `art` entry in `src/app/page.tsx`.

| Name | Kind | Ratio | Where | What it is |
|---|---|---|---|---|
| `hero-media` | video | 16 / 9 | Hero, under the title | `public/landing/slots/hero-media.mp4` (poster `hero-media.jpg`): a battery with record-style callouts, on the page's orange and charcoal. A generated clip, not footage of Synovra equipment. The generator's corner logo was removed from the file. |
| `solution-fleet` | illustration | 4 / 3 | Solutions row, card 01 | `FleetArt`: a status ring of eleven batteries (four good, three watching, four needing attention) and the same batteries by site. |
| `solution-record` | illustration | 4 / 3 | Solutions row, card 02 | `RecordArt`: a modelled cutaway of one battery, one cell tinted, joined to its record card. |
| `solution-actions` | illustration | 4 / 3 | Solutions row, card 03 | `ActionsArt`: capacity at two approved tests either side of an engineer-approved service visit, with a demo request button. |
| `solution-reports` | illustration | 4 / 3 | Solutions row, card 04 | `ReportsArt`: a stack of report sheets with a section table, gaps marked "not recorded", a "not a certificate" stamp and export chips. |
| `platform-twin` | component | 17 / 8.5 | Platform section | The exploded battery drawing (`ExplodedBattery.tsx`). Replace it with a richer interactive view whose state follows the battery's data. |

`tests/e2e/landing.spec.ts` checks that no blank placeholder is left, that each drawing is labelled for assistive technology and keeps its shape, and that the honest captions are present. A video slot plays muted and looping, does not start for people who prefer reduced motion, and always has a pause button.

## Not placeholders

The record coverage panel in the hero and the sample evidence checksums are not data from a live system. The coverage rows say, for each part, whether it is in use, simulated or not connected in this build; the checksums are invented prefixes. Both are labelled synthetic on the page.
