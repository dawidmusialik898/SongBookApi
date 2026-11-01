# PDF typography and layout

Owners choose per-export options on **New PDF**, alongside entire/selected songs
and the chords toggle. Readers and editors can still list and download exports.
Selection and options remain in the form after generation failures; controls
are disabled during generation. Landscape suggests two columns; switching back
to portrait clamps a three-column selection to one.

`POST /songbooks/{bookId}/pdfs` accepts optional customization fields:

| Field | Accepted values | Omitted/null default |
| --- | --- | --- |
| `fontFamily` | `lato`, `dejavu-sans-mono` | `lato` |
| `fontSize` | integer 8-18, in points | 10 |
| `orientation` | `portrait`, `landscape` | `portrait` |
| `columns` | portrait 1-2; landscape 1-3 | 1 |

Invalid values return `400` validation errors under the corresponding field.
`includeChords` remains required; omit `songIds` for the entire book or supply a
nonempty array of distinct song IDs belonging to this book. Generation requires
the existing owner authorization and antiforgery token.

All export metadata includes the effective four fields. Stored options describe
that saved file permanently, not user preferences. The client defaults missing
fields in older metadata fixtures to the original settings, but rejects invalid
supplied metadata. Apply `AddPdfCustomization` after the history migrations;
existing rows receive defaults without touching their bytes or content revision.

Rendering uses actual A4 portrait/landscape pages. QuestPDF 2026.9.1's
`MultiColumn`, with height balancing disabled, flows canonical title/ID-ordered
content down a column, across subsequent columns, and onto further pages.
One-column exports use the ordinary `Column` API (`MultiColumn` requires at least
two columns). Headers and footers span the page. Compact groups stay together
when possible; long groups reserve a bounded heading/lyric start and can split.

Only QuestPDF-supplied Lato and embedded DejaVu Sans Mono are used; system font
discovery is disabled. Chorded lyrics always use embedded monospace, irrespective
of the selected body font. The 10 pt default retains a 9 pt chord grid and the
85-cell default wrap; other layouts derive wrap capacity from column width and
the bundled font's cell advance. All typography scales proportionally.
Close chord cells widen rather than overlap. Oversized symbols split into
additional rows aligned to the same lyric anchor, without dropping characters.
Tabs expand to four spaces; UTF-16 offsets map through Unicode text elements.
Glyphs absent from both bundled families (for example some emoji/CJK) retain the
existing placeholder-glyph behavior.

A successful save stages `pdf.generated` with the trusted current actor through
`IActivityWriter` in the same EF transaction/save as the PDF. It does not advance
song revisions or book content revisions, nor make existing PDFs stale.
Content mutations retain their existing staleness behavior; old bytes remain
downloadable unchanged.
