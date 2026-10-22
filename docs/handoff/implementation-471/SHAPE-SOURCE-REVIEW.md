# #471 shapes and abbreviations — independent root source review

Reviewed product source `1ee22ad7c2da4f0232af8d2f291c32c8c90b58f9` against prior icon checkpoint `4ff8f8d4` (documentation-only successor of `d50abbc0`). Root did not author this shape/abbreviation implementation. Inspected the exact component/CSS delta and existing swatch consumers, including quantitative bar segments using the shared color classes.

The first source `1dcc5013` placed circle/triangle geometry on global `.sw-want`/`.sw-future`, which also style proportional spending/budget bars. Root reported that concrete P2. The correction scopes geometry to `.sw.sw-want` and `.sw.sw-future`; quantitative bars without `.sw` retain their original rectangle geometry and fills. Shared ClassSwatch renders deterministic B/W/Z beside square/circle/triangle marks, retains class fills/hatches and decorative aria-hidden behavior, and leaves existing caller labels and bound/debt/open rendering intact. No financial values or handlers change. No further actionable source finding in this bounded delta.

This review does not establish rendered spacing, clipping, contrast, accessibility or print acceptance. No tests, checks, typechecks, builds, browser or runtime execution performed. NOT VALIDATED / NOT LIVE.
