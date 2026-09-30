# Current Implementation Status and TODO

> Snapshot date: 2026-09-30
>
> This tracking document reflects the current staged, unstaged, and untracked
> worktrees. It is not an additional implementation stage.

## Status

| Plan area | Status | Result |
| --- | --- | --- |
| Points 01-09 | Complete | Browser-native song CRUD, truthful failure states, responsive UI, keyboard/focus behavior, and contract-safe parts editing are implemented. |
| Point 10 | Automated validation complete | Current API/client suites, architecture checks, migrations, and a real HTTPS restart workflow pass. Visual browser and accessibility-tree inspection remains manual. |
| Point 11 | Complete | Same-origin Identity cookie authentication, confirmation/recovery, antiforgery, rate limiting, protected routes, private-state cleanup, and auth UI are implemented. |
| Point 12 | Complete | Persistent private song books, nested songs, Reader/Editor/Admin authorization, collaborator management, revocation, restart persistence, client UI, and isolation tests are implemented. |
| Point 13 | Host verification pending | Approved home-host deployment is packaged and locally tested; public HTTPS, mail, second-machine restore, monitoring, and rollback still need on-host verification. |

## Delivered application

- Identity users, song books, access entries, songs, ordered parts, and
  timestamps share one EF Core SQLite database.
- Every song belongs to exactly one song book.
- The creator is the sole Admin; collaborators can be Reader or Editor.
- Reader can view, Editor can manage songs, and only Admin can rename/delete
  books or manage collaborators.
- Private resources are scoped by book and caller on every request.
- Permission changes take effect on the next request.
- The client immediately removes inaccessible cached private data.
- Unsaved drafts survive session expiration outside rendered private state and
  are restored only for the same account after book access is revalidated.
- All mutations require antiforgery; anonymous private routes return `401`.
- The old global `/songs` routes and `InMemorySongRepository` are removed.
- The Development API serves the vanilla client from the same HTTPS origin.

## Current validation evidence

- Release `dotnet test SongBookApi.slnx`: 61 passed, 0 failed.
- Client Node suites: 63 passed, 0 failed.
- EF migrations:
  `20260727222024_AddIdentity`,
  `20260831193025_AddSongBooks`,
  `20260930164257_AddUserModeration`.
- A real `https://localhost:7152` run completed authenticated book creation,
  nested song creation/listing, API restart, and persisted retrieval.
- API tests cover private visibility, guessed IDs, cross-book song isolation,
  Reader/Editor/Admin permissions, collaborator grant/change/removal,
  immediate revocation, name/access uniqueness, cascades, part order, restart
  persistence, cookie attributes, rate limiting, and missing/invalid CSRF.
- Client tests cover book CRUD, nested adapters, role-aware controls,
  collaborator flows, access loss, stale responses, logout races, and
  cross-account draft isolation.
- Raw `fetch` appears only in `src/httpClient.js`; client source has no browser
  auth storage, hard-coded API origin, or unscoped song route.
- The packaged Production process served the client and API from one origin,
  applied migrations only on request, enforced host filtering and backup-age
  health checks, and persisted Data Protection keys. A local SFTP rehearsal
  backed up and restored sample SQLite data and key bytes; real off-host
  recovery still needs a host-side test.

## Remaining TODO

### Manual local browser inspection

- [ ] Run the three-account browser script from point 12 using separate
      profiles for Owner, Reader, and Editor.
- [ ] Inspect the real Network panel for cookie, antiforgery, `401`, `403`,
      `404`, nested route, and response behavior.
- [ ] Complete keyboard-only CRUD and collaborator administration.
- [ ] Inspect 200-percent zoom, 320 CSS pixel layout, focus restoration,
      live-region announcements, and the browser accessibility tree.

These checks require a normal browser and do not represent missing application
code.

### Dependency advisories

- [x] The 2026-09-30 `dotnet list ... package --vulnerable
      --include-transitive` scan reported no known vulnerable packages for the
      service; the earlier OpenApi and SQLite advisories were resolved in the
      current worktree.
- [ ] Repeat the scan on the exact release candidate before deployment.

### Point-13 decisions

- [x] Choose the hosting provider and runtime/container topology.
- [x] Choose durable production database hosting.
- [x] Choose the confirmation/password-reset email provider.
- [x] Choose the public domain and TLS ownership model.
- [x] Choose durable ASP.NET Core Data Protection key storage.
- [x] Define backup frequency, retention, acceptable data loss, and restore
      target.
- [x] Choose logging, monitoring, health checks, alerts, and recipients.
- [x] Choose manual SSH delivery and rollback; stage/verify before public
      release and separately decide whether branch protection is needed.
- [x] Add the approved decision record to
      `13-production-readiness.md`.

### Point-13 implementation after approval

- [x] Package static client assets instead of reading a sibling source
      checkout in production.
- [ ] Configure provider-specific persistence, controlled migrations,
      automated backups, and a tested restore on the real host (templates and
      local rehearsal exist).
- [x] Replace the Development email logger outside Development with the
      configured SMTP sender (real Gmail delivery still needs verification).
- [ ] Configure production secrets, Data Protection, trusted HTTPS, HTTP
      redirection, HSTS, safe errors, security headers, and CSP on the host
      (packaged application and templates locally verified).
- [ ] Add structured secret-free logs, health probes, monitoring, alerts, and
      operational runbooks (health/runbook prepared; external alert pending).
- [ ] Add a repeatable Release build, test, scan, migration, staging,
      deployment, verification, and rollback pipeline (manual release process
      prepared; staging/rollback still need real-host rehearsal).
- [ ] Pass all point-10/11/12 matrices and point-13 operational gates in
      staging before release.

## Worktree handoff

- [ ] Review the combined staged, unstaged, and untracked changes in both
      repositories.
- [ ] Review and commit the intended changes in both repositories, including
      the separate moderation work, before publishing a release.
