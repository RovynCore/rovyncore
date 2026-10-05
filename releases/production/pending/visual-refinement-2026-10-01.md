# RovynCore visual refinement — local preview

Date: 2026-10-01. Preview: http://127.0.0.1:5173/. This update is not published.

The existing crystal media, forest/olive palette and lime identity are retained.

## Visual review

Subjective score: before 7/10, after 8.3/10. This is a design assessment, not a user study or a monetary valuation.

| Area | Before | Refinement |
| --- | --- | --- |
| First-screen proportion | 1,050px hero at 1873×1172; large space above the copy | 900px hero, adjusted copy position; 710px at 1440×900 |
| Motion | Pointer movement translated and scaled hero media | Pointer parallax removed from the shared enhancement; video playback retained |
| Hierarchy | Small navigation; section title scales varied; awkward Chinese heading breaks | Wider desktop links, 16px navigation, 15px wallet text; consistent section heading scale and deliberate Chinese story line break |
| Actions | 600px desktop action group; English secondary buttons clipped on narrow screens | 640px action group, 24px primary / 20px secondary desktop text; full-width mobile buttons and wrapping long labels |
| Story and section rhythm | Different content gutters; story heading restricted; oversized final CTA section | Shared gutters, consistent section spacing, clearer story heading, reduced final section height |
| Marquee | Five short repeated slogans | Five longer meaningful sentences in all four supported languages; 80-second loop, softer styling and aria-hidden duplicates |
| Narrow tablet | English brand/navigation wrapped | Collapsible navigation through 950px, matching the menu's resize behavior |

Reference: [Linear: A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh). Its discussion of attention hierarchy and subtle structure informed this refinement; RovynCore's own visual identity was preserved.

## Verification

- TypeScript check passed: `tsc --noEmit --incremental false`.
- Final vinext build passed. Existing large-chunk warning remains.
- Inspected homepage, launchpad, onchain record and RVYN pages on desktop and at 390px; no horizontal page overflow in the checked views.
- Tested homepage at 1873×1172, 1440×900, 820px, 768px, 390px and 320px.
- English and Traditional Chinese mobile buttons fit; Korean long primary label at 320px now fits. Four-language hero/marquee copy updated.
- Tablet menu opens, Escape closes it, and language switching works.
- Tested the roadmap stage control and keyboard navigation; inspected the updated story and roadmap.
- Compared the video's bounding rectangle and computed translate/scale before and after moving the pointer between opposite parts of the hero: unchanged; translate/scale are `none`.
- Existing RVYN contract placement and address remain intact.
- No deployment, database migration, wallet signing or onchain action performed.

Source SHA-256 hashes are in `source-hashes.json`. Original changed files were backed up in the workspace's `work/visual-refinement/original/` directory.
