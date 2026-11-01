# Read-only share links

## Goal and defaults

Add anonymous read-only book sharing without changing registered collaborator
permissions. Links are disabled by default, owner-controlled, revocable and
rotatable, with one active link per book and no automatic expiry.

Anyone with a valid link may read book/song details, search and page through
songs, use previous/next and chords, and list/download saved PDFs. Public routes
never expose collaborators, history, actor identities, copying, PDF generation
or other mutations. Display "Shared song book - read-only", even to owners.
Explain that downloaded/read content cannot be recalled by revocation.

## Implementation

1. Persist a one-per-book share entity containing only a SHA-256 token hash,
   creation UTC timestamp and optional actor reference. Generate 32 random bytes
   encoded as base64url. Unique token hash; cascade on book deletion.
2. Add owner-only authenticated GET/POST/DELETE
   `/songbooks/{bookId}/share-link`. GET returns enabled/created metadata without
   secrets; POST creates/replaces and returns the raw token once; DELETE revokes.
   Mutations require antiforgery and atomic private activity recording.
3. Add anonymous GET-only `/shared/songbooks/{bookId}` and matching nested
   songs, adjacency and PDF list/download routes. Require
   `X-SongBook-Share-Token` on every request, independently of cookie membership.
   Reuse existing service queries/response mappings, SQL order and validation.
4. Share `/#/shared/books/{bookId}/{token}` fragment URLs. Never store raw tokens
   in the database/history/browser storage or put them in query strings/logs.
   Use no-store/no-referrer; missing, wrong-book, revoked and invalid tokens
   return 404. Add a 60/minute/IP fixed-window public-read limiter, no queue.
5. Add public client routes/API/screens that work without sign-in or successful
   `/auth/me`. Do not open private routes on auth failure or override deliberate
   password-reset/auth flows. Retain abort/session-generation safeguards.
6. Extend owner sharing with enable/replace/revoke, a readonly link field and
   clipboard copy with selectable-field fallback. Explain that the link is shown
   only after creation/replacement and replacement invalidates the previous link.
7. Extend fake API/browser helpers and document the capability boundary.

## Files and integration

Touch narrowly scoped link entity/repository/service/contracts/endpoints,
`SongBookDbContext`, migrations/designer/snapshot, `Program.cs`, service/rate-limit
registration, `client/src/routes.js`, `router.js`, sharing screen/form, public
screens/API adapter, and fake API/browser helpers.

Implement after history; use its activity writer for owner management without
recording tokens. Do not make the normal membership service token-aware.
Preserve CSP and render user data literally with stylesheet classes.

## Acceptance and validation

Real API tests cover owner/reader/editor/outsider permissions, antiforgery,
hash-only persistence, rotation/revocation, wrong-book tokens, public reads,
private/mutation denial, no membership creation, deleted books, no-store and
rate limits. Client tests cover anonymous/authenticated/outage public rendering,
read-only controls, clipboard/fallback, revoked links and navigation races.

Run focused link tests plus existing authorization, sharing, router, session,
navigation and client-security tests. A fresh browser must read only the linked
book without signing in and lose subsequent access immediately on revocation.
