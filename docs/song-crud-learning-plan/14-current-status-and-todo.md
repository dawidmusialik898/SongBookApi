# Current Implementation Status and TODO

> Snapshot date: 2026-08-31
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
| Point 13 | Decision-blocked | Production work requires approved provider, recovery, monitoring, and delivery decisions. |

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

- `dotnet test SongBookApi.slnx`: 24 passed, 0 failed.
- Client Node suites: 54 passed, 0 failed.
- EF migrations:
  `20260727222024_AddIdentity`,
  `20260831193025_AddSongBooks`.
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

- [ ] Resolve or explicitly risk-accept with an upgrade plan transitive
      `Microsoft.OpenApi` `2.0.0`,
      `GHSA-v5pm-xwqc-g5wc`.
- [ ] Resolve or explicitly risk-accept with an upgrade plan transitive
      `SQLitePCLRaw.lib.e_sqlite3` `2.1.11`,
      `GHSA-2m69-gcr7-jv3q`.
- [ ] Rerun the vulnerability scan and update the API README and point-13
      decision record.

Point 13 cannot pass its production gate while either advisory remains
unresolved or unapproved.

### Point-13 decisions

- [ ] Choose the hosting provider and runtime/container topology.
- [ ] Choose durable production database hosting.
- [ ] Choose the confirmation/password-reset email provider.
- [ ] Choose the public domain and TLS ownership model.
- [ ] Choose durable ASP.NET Core Data Protection key storage.
- [ ] Define backup frequency, retention, acceptable data loss, and restore
      target.
- [ ] Choose logging, monitoring, health checks, alerts, and recipients.
- [ ] Choose deployment, migration, staging, rollback, and protected-branch
      delivery workflow.
- [ ] Add the approved decision record to
      `13-production-readiness.md`.

### Point-13 implementation after approval

- [ ] Package static client assets instead of reading a sibling source
      checkout in production.
- [ ] Configure provider-specific persistence, controlled migrations,
      automated backups, and a tested restore.
- [ ] Replace the Development email logger.
- [ ] Configure production secrets, Data Protection, trusted HTTPS, HTTP
      redirection, HSTS, safe errors, security headers, and CSP.
- [ ] Add structured secret-free logs, health probes, monitoring, alerts, and
      operational runbooks.
- [ ] Add a repeatable Release build, test, scan, migration, staging,
      deployment, verification, and rollback pipeline.
- [ ] Pass all point-10/11/12 matrices and point-13 operational gates in
      staging before release.

## Worktree handoff

- [ ] Review the combined staged, unstaged, and untracked changes in both
      repositories.
- [ ] Commit the completed point-11/12 implementation as a clean baseline
      before starting provider-specific point-13 work.
