# RVYN hero contract placement — 2026-10-01

Status: local preview only; not published to production.

- Removed both requested RVYN sections: the official onchain record card and the “Our first chapter” story with three step cards.
- Moved the full official token address `0x545a1ff27596de2f31480df39aa9548f363fc361` into the lower-left corner of the first hero section, using the existing canonical RVYN model constant.
- Preserved the copy-address action with its translated accessible label and success/error feedback.
- Mobile addresses wrap into readable groups; no truncation or overlap with the hero's text/buttons.
- Browser checks at 1440px, 390px and 320px: removed sections are absent, exact full address is present, address stays inside the hero, no horizontal overflow at mobile widths.
- TypeScript check passed. Final production build passed with the existing large-chunk warning.
- Changed files: `app/rvyn/page.tsx`, `app/retained-visuals.css`. Final SHA-256 hashes are in source-hashes.json.
- No production publish, database change, wallet transaction or smart-contract change.
