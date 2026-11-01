# Security and dependency audit — 2026-11-01

Scope: the whole repository, covering `client/`, `server/` and `deploy/`. This was a read-only review of the code and
configuration. No penetration test was run against a deployed host.

## Summary

The audit found no critical or high-severity issues. Authentication, authorization, CSRF protection, cookies, CSP and
the client's DOM handling are all solid. The findings are about account enumeration, missing limits on resources, and
an HSTS setting in the deployment template. All four have been fixed or mitigated; see [Open items](#open-items) for
what remains.

| # | Severity | File | Lines | Issue | Confidence |
|---|----------|------|-------|-------|------------|
| 1 | 🟡 MEDIUM | server/src/SongBookApi.Service/Endpoints/AuthEndpoints.cs | 69-79, 247-253 | Register leaks whether an email is taken through Identity's `DuplicateEmail`/`DuplicateUserName` errors | 9/10 |
| 2 | 🟡 MEDIUM | server/src/SongBookApi.Service/Services/SongBookService.cs, Endpoints/SongBookEndpoints.cs | 103-108, 186-189 | Signed-in users can check whether an email is registered through `PUT /songbooks/{id}/access` (404 vs 200), with no rate limit | 8/10 |
| 3 | 🟡 MEDIUM | Contracts/Song.cs, SongBookPdfEndpoints.cs, SongBookPdfService.cs, EfActivityWriter.cs | various | No size limits on song fields or part counts; PDF generation has no rate limit and stored PDFs and revisions are never cleaned up, so disk and CPU can be exhausted | 7/10 |
| 4 | ⚪ LOW | deploy/songbook.env.example; server/src/SongBookApi.Service/Program.cs | 12; 29-32, 74-77 | HSTS is off by default and its max-age is only 30 days | 8/10 |

### 1. The register endpoint reveals existing accounts

When `userManager.CreateAsync` fails, the endpoint returns Identity's error codes and text, such as "Email 'x' is
already taken". The forgot-password and resend-confirmation endpoints deliberately return the same generic response
either way, but this endpoint undoes that protection.

**Fix:** if the only errors are `DuplicateEmail` or `DuplicateUserName`, return the same `202 Accepted` generic
response, and optionally email the existing owner. Keep returning the password-policy errors.

**Status:** fixed (Phase 2, S1). Password errors are checked first; duplicate emails get the generic `202`, and the
owner is emailed an account-exists notice (or a new confirmation link if unconfirmed).

### 2. The collaborator endpoint can be used to check which emails are registered

Any confirmed user can create a book and then call `PUT /songbooks/{ownBookId}/access` with a list of emails. A 404
means the email isn't registered and a 200 means it is. A follow-up `DELETE` removes the record, so the target is never
notified. This endpoint has no rate limit.

**Fix:** add `.RequireRateLimiting(...)` with a per-user policy. Better still, return the same response whether or not
the email exists, for example by storing a pending invitation.

**Status:** mitigated (Phase 2, S2) with a per-user `collaborator-invite` rate limit of 20 per hour. The 404/200
difference remains; pending invitations are not implemented.

### 3. Missing limits on resources

- `Title`, `Author`, `Key`, `Tempo`, `Number`, part `Name`/`Text` and the number of parts have no length or count
  limits. Only book name (100) and chord symbol (64) have a `HasMaxLength`.
- The only request body limit is Kestrel's default of about 30 MB.
- Every edit stores a full JSON snapshot in `SongRevisions`.
- `POST /songbooks/{id}/pdfs` renders the PDF synchronously inside the request and stores the bytes in SQLite
  permanently. It has no rate limit and no retention limit.

Registration is open, so one user can fill the disk and the backups and keep the CPU busy on this single-host
deployment.

**Fix:**
- Validate field lengths and part and chord counts in the create and update song handlers, and add matching
  `HasMaxLength` constraints with a migration.
- Set a smaller `MaxRequestBodySize`.
- Rate-limit PDF generation per user.
- Keep only the last N PDFs per book.
- Consider a limit on how many books or songs one user can have.

**Status:** partly fixed (Phase 2, S3a–S3c). Song field and count limits are validated in the handlers (no
`HasMaxLength` migration, because SQLite doesn't enforce it). Request bodies are capped at 2 MB, PDF generation is limited to 10 per user per hour,
and only the newest 20 PDFs per book are kept. Still open: revision snapshot growth and per-user quotas (S3d needs a
product decision) and a production check against the new limits; see [Open items](#open-items).

### 4. HSTS

`deploy/songbook.env.example` ships with `Security__HstsEnabled=false`. Once TLS on the public host is stable, enable
it and raise the max-age to at least 180 days. Because the cookies are `__Host-` and `Secure`, they can't leak over
HTTP. The remaining risk is a downgrade or phishing attack on a user's first visit.

**Status:** fixed (Phase 2, S4). The max-age is now one year, and enabling HSTS is a required go-live checklist step in
`deploy/README.md`.

## Controls already in place

- **Authorization:** every `/songbooks/**` route requires authentication. `ISongBookAccessService` checks the user's
  reader, editor or owner access, and every repository query is filtered by `SongBookId`, so one book's data can't be
  reached through another book's ID.
- **Admin-only actions:** owner-only actions (rename, delete, access, share links) are enforced. Moderators can't act
  on themselves, superusers or other moderators. Role changes are superuser-only and are written to an audit log.
- **CSRF:** every state-changing endpoint has an antiforgery filter that reads the `X-CSRF-TOKEN` header. No CORS is
  configured.
- **Cookies:** cookies use the `__Host-` prefix and are `HttpOnly`, `Secure` and `SameSite=Lax`. Sessions last 8 hours
  with sliding expiry. The security stamp is checked on every request, so bans and password resets end existing
  sessions immediately.
- **Login and passwords:** login is limited to 10 requests per minute per IP, and accounts lock for 15 minutes after 5
  failures. Email endpoints are rate-limited. Passwords need at least 12 characters, and email confirmation is
  required.
- **Share links:** tokens are 256-bit, created with a secure random generator and stored only as a SHA-256 hash. They
  are sent in a header and kept in the URL fragment, which browsers never send to the server. The anonymous endpoints
  are rate-limited and return `no-store`.
- **Headers:** CSP is strict (`script-src 'self'`, `style-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri 'none'`). `nosniff` and `Referrer-Policy: no-referrer` are set. A wildcard `AllowedHosts` is rejected, and
  forwarded headers are trusted only from loopback.
- **Client:** there are no `innerHTML`, `eval` or `document.write` calls. The DOM is built with
  `textContent`/attributes, and PDF downloads use blob URLs.
- **Database and email:** there is no raw SQL; everything uses EF Core LINQ. SMTP uses TLS or STARTTLS, and
  recipients are checked against header injection. Account links are built from the configured origin, not the request's
  `Host` header.
- **Secrets and deployment:** no secrets are committed. The SMTP password comes in through a systemd credential. The
  systemd units are hardened, Kestrel listens only on loopback behind Caddy, and the publish script drops
  `appsettings.Development.json`.

## External dependencies

`dotnet list server/SongBookApi.slnx package --vulnerable --include-transitive` reported no vulnerable packages. The
client has no dependencies.

At audit time the server had 17 `PackageReference` entries. The unused OpenAPI packages (`Microsoft.AspNetCore.OpenApi`
and its `Microsoft.OpenApi` pin), `coverlet.collector`, and the test project's duplicate
`Microsoft.EntityFrameworkCore.Sqlite` reference were then removed, leaving 13. The two security pins
(`System.Security.Cryptography.Pkcs`, `SQLitePCLRaw.bundle_e_sqlite3`) are kept and commented in their csproj files.
[External dependencies](external-dependencies.md) is the current inventory and dependency policy.

## Open items

- **Revision growth (S3d).** Each song edit stores a full JSON snapshot, now bounded per edit by the song limits.
  Keeping only the last N revisions per song would change the history feature's promise, so it needs a product
  decision first.
- **Per-user quotas (S3d).** For example 50 owned books per user and 2,000 songs per book. Deferred unless abuse is seen.
- **Collaborator email lookup (finding 2).** Removing the 404/200 difference needs pending invitations that respond the
  same way for every email; this is a feature-sized change.
- **Existing data vs. song limits.** Before deploying the limits, check production for songs that exceed them and raise
  a limit if needed, otherwise those songs can no longer be edited.
- **Optional MailKit replacement.** See the trade-offs in [external dependencies](external-dependencies.md).
