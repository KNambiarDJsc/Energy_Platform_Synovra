# Landing page slots

The landing page (`src/app/page.tsx`) is laid out after the structure of shift5.io: a split hero, a status panel, a draggable row of solutions, a platform section, and a full-screen menu. Anywhere a video, illustration or component belongs but has not been supplied, the page shows a named, hatched placeholder (`src/components/landing/Slot.tsx`) that says what goes there and in what shape.

## Filling a slot

Put the file at `public/landing/slots/<name>.<ext>` and pass it to the slot:

```tsx
<Slot name="solution-identity" kind="illustration" ratio="4 / 3" note="…" src="/landing/slots/solution-identity.svg" alt="A battery being scanned" />
```

- `kind="video"` renders a muted, looping, autoplaying video (decorative, so give it no alt).
- Any other kind with `src` renders an image; give it an `alt`.
- Children win over `src`: pass a component (as `platform-twin` does) to put something live in the slot.
- The ratio is the shape the layout reserves. Supply media in that ratio and nothing else moves.
- Do not caption an image as a photograph of Synovra equipment unless it is. Drawings are captioned as drawings.

## The slots

| Name | Kind | Ratio | Where | What belongs there |
|---|---|---|---|---|
| `hero-media` | video | 21 / 9 | Hero, under the title | A battery passing through intake, test, restoration and a decision, ending on its record. |
| `solution-identity` | illustration | 4 / 3 | Solutions row, card 01 | A battery being scanned, its record opening beside it. |
| `solution-evidence` | illustration | 4 / 3 | Solutions row, card 02 | A bench test with its curve, instrument and certificate. |
| `solution-decisions` | illustration | 4 / 3 | Solutions row, card 03 | Two tests either side of an attempt, a reviewer's sign-off. |
| `solution-recovery` | illustration | 4 / 3 | Solutions row, card 04 | A battery's last journey, from site to recycler. |
| `platform-twin` | component | 17 / 8.5 | Platform section | Filled: the exploded battery drawing (`ExplodedBattery.tsx`). Replace it with a richer interactive view whose state follows the battery's data. |

`hero-media` and the four `solution-*` slots are empty today. A test (`tests/e2e/landing.spec.ts`) lists the empty slots by name, so filling one means updating that list.

## Not placeholders

The record coverage panel in the hero and the sample evidence checksums are not data from a live system. The coverage rows say, for each part, whether it is in use, simulated or not connected in this build; the checksums are invented prefixes. Both are labelled synthetic on the page.
