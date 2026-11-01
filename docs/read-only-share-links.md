# Anonymous read-only links

Owners can enable, replace or revoke a reader link from **Share**. Existing books
have no link; links have no expiry. Only one is active per book. Copy the readonly
field immediately after enabling/replacing: the secret cannot be retrieved later.
Clipboard failure selects the field for manual copying. Replacement invalidates
the previous link; revocation stops subsequent requests, not already-read content
or downloaded files.

The capability URL is `https://your-host/#/shared/books/{bookId}/{token}`.
The fragment is not sent on the initial document request. Treat it as a secret;
anyone receiving it can read that book. The browser keeps it only in the URL and
current in-memory navigation state, never local/session storage or API query
strings. Every public API request uses `X-SongBook-Share-Token`. Avoid logging this
header or fragment URLs in proxies, analytics, support tooling and screenshots.

Public book, search/paged song lists, song details, chords, previous/next and saved
PDF list/download screens say **Shared song book - read-only**, even for the owner.
They work anonymously or when `/auth/me` is unavailable; private routes still
require the normal session. Deliberate password-reset/auth flows take precedence.
Public reads do not populate the private list cache.

## API and persistence

Authenticated owner management:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/songbooks/{bookId}/share-link` | `{ enabled, createdAtUtc }`, no secret |
| POST | `/songbooks/{bookId}/share-link` | `{ token, createdAtUtc }`, secret returned once |
| DELETE | `/songbooks/{bookId}/share-link` | `204`, idempotent revocation |

POST/DELETE require `X-CSRF-TOKEN`. Reader/editor membership returns `403`;
inaccessible books return `404`, anonymous callers `401`. Server-trusted activity
attribution records `link.created`, `link.replaced`, `link.revoked` atomically with
the mutation. These activities are owner-only and contain no secrets.

Separate anonymous GET-only paths:

- `/shared/songbooks/{bookId}`
- `/shared/songbooks/{bookId}/songs?page=1&search=term`
- `/shared/songbooks/{bookId}/songs/{songId}`
- `/shared/songbooks/{bookId}/songs/{songId}/adjacent`
- `/shared/songbooks/{bookId}/pdfs?page=1`
- `/shared/songbooks/{bookId}/pdfs/{pdfId}/download`

Each requires its own valid header token, irrespective of cookies. Missing,
invalid, wrong-book, replaced/revoked tokens and absent resources return `404`.
There are no public history, actors, collaborators, copy, generation or mutation
operations. No membership is created, and a token never grants access to private
`/songbooks` routes. Reads reuse normal SQL ordering/search and saved customized
PDF metadata/content. All public responses (including denials and rate limits)
and link-management responses use `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`. The document also has these safeguards; CSP is
unchanged. Public GETs have a fixed-window 60/minute/IP limit with no queue (`429`).
Production trusts forwarded IPs only from the configured loopback proxy.

Apply `20261101070812_AddReadOnlyShareLinks` after history/PDF migrations. It creates
`SongBookShareLinks`, keyed by book, with a unique SHA-256 token hash, UTC creation
time and nullable actor FK. Tokens are 32 cryptographically random bytes encoded
base64url; only their hashes are persisted. Book deletion cascades links; user
deletion nulls actor attribution. Existing books remain disabled.

Focused coverage: `ShareLinkTests`, `share-links.test.mjs`,
`share-links-api.test.mjs`, plus the existing authorization, sharing, router,
session-expiry, navigation-races and client-security suites.
