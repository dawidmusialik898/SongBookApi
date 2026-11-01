# PDF customization

## Goal and defaults

Add per-export typography/layout while preserving whole/selected songs, chords,
owner-only generation and reader downloads.

| Option | Values | Existing/default behavior |
| --- | --- | --- |
| fontFamily | lato, dejavu-sans-mono | lato |
| fontSize | integer 8-18 pt | 10 pt; proportional scaling retains 9 pt chord rows |
| orientation | portrait, landscape | portrait |
| columns | portrait 1-2; landscape 1-3 | 1 when omitted; UI suggests 2 on landscape |

Use only QuestPDF-supplied Lato and existing embedded DejaVu Sans Mono. Chorded
lyrics remain monospace for anchoring regardless of chosen proportional font;
explain this in the UI. No uploads, arbitrary/system fonts, live preview, paper
size editor, background jobs or user preference storage.

## Implementation

1. Add optional request fields and a centralized validated effective-options
   record. Return field-specific 400s for invalid names, bounds/combinations.
2. Persist effective options on each PDF; update metadata/projections/contracts
   and client parsing together. Migrate existing rows to old defaults without
   regenerating bytes or changing PDF/content-revision staleness behavior.
3. Render actual A4 portrait/landscape dimensions and supported flowing columns
   in canonical song order, top-to-bottom then across columns/pages. Verify
   installed QuestPDF APIs; do not use modulo assignment or fixed song slices.
   Keep header/footer full-width with appropriate margins/gutters.
4. Scale typography and derive chord wrap capacity from usable column width/font
   metrics. Preserve old default helper behavior where possible. Keep anchors,
   Unicode/tabs/close chords intact. Handle long lyrics/songs/parts and oversized
   chord symbols without clipping/truncation or impossible keep-together blocks;
   oversized symbols may need additional aligned rows.
5. Add labeled form controls, validation, landscape suggestion/portrait clamp,
   busy state and payload fields. Failed generation retains options/selection.
6. Show effective font/size/orientation/columns in saved export listings; tolerate
   absent old fixture fields with documented defaults.
7. Record successful generation using history's private activity writer without
   advancing song/book content revisions. Extend fake API and documentation.

## Files and integration

Primary files: PDF entity/repository/service interfaces, contracts/endpoints,
`SongBookPdfService.cs`, `SongBookPdfRenderer.cs`, EF PDF repository/context,
migrations/designer/snapshot, client PDF screens/helper and fake API.
Implement after history; do not alter authentication, existing stored bytes,
SQL `ORDER BY Title, Id`, embedded-font independence or CSP.

## Acceptance and validation

API tests cover defaults, all permitted combinations, invalid fields,
authorization/antiforgery, persistent metadata, existing DB upgrade and staleness.
PdfPig tests inspect actual page dimensions, font/size, distinct flowing columns,
canonical order, text bounds and chord X/Y alignment, including maximum-size
three-column landscape, long symbols/unbroken lyrics, Unicode and empty books.
Client tests cover defaults, control transitions, payload, errors and list labels.

Run PDF functional/renderer and client PDF unit/integration tests. Check asset
publishing only if fonts/resource/package configuration changes. Generated files
must visibly honor options without losing lyrics/chords.
