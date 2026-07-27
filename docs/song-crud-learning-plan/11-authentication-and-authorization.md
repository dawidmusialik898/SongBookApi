# 11 - Authentication and Authorization

## Goal

Add account registration, email confirmation, login, logout, password
recovery, and a secure browser session between the vanilla client and the
ASP.NET Core API.

In this stage, song reads remain public while writes require an authenticated
user whose email address has been confirmed. Point 12 replaces the temporary
global song collection with private, permission-scoped song books.

## Selected decisions

These decisions were made before writing this plan and are not open for an AI
model to reinterpret during implementation:

| Decision | Selected behavior |
| --- | --- |
| Authentication framework | ASP.NET Core Identity |
| Browser session | Secure, HTTP-only Identity cookie |
| Hosting model | Client and API share one HTTPS origin |
| Registration | Public self-registration |
| Email confirmation | Required before login/write access |
| Temporary public API access | `GET /songs` and `GET /songs/{id}`, superseded by point 12 |
| Protected API access | `POST`, `PUT`, and `DELETE` song endpoints |
| Editor role | Every confirmed registered user can modify songs |
| Client technology | Vanilla HTML, CSS, and ES modules |

Public registration means anyone who controls a confirmable email address can
become an editor. That is intentional for this point. Adding invitations,
administrator approval, roles, or private reads is a separate product change.

## AI implementation specification

### Status and prerequisites

This stage is pending. Points 01-10 must be complete.

The implementation must preserve all existing CRUD behavior while changing
the final development URL from the lite-server origin to:

```text
https://localhost:7152/
```

After this point, authenticated workflow testing must not use
`http://localhost:3000`; same-origin cookies and antiforgery protection are
part of the selected architecture.

### Security model

Use all of these controls together:

1. ASP.NET Core Identity stores users and password hashes.
2. Identity issues an HTTP-only secure same-origin cookie after login.
3. Email confirmation is required before Identity permits sign-in.
4. An authorization policy protects song write endpoints.
5. Antiforgery tokens protect every state-changing cookie-authenticated
   request, including login and registration.
6. Login lockout and endpoint rate limiting slow brute-force and email abuse.
7. Login, resend-confirmation, and password-recovery responses avoid revealing
   unnecessary account-existence information.
8. The browser never stores passwords, auth cookies, or persistent bearer
   tokens in JavaScript-accessible storage.

Authentication answers "who is this user?" Authorization answers "may this
user perform this operation?" Implement and test both.

## Target architecture

### Server

```text
ASP.NET Core HTTPS origin
  /
    -> SongBookClient/index.html
  /src/*
    -> SongBookClient/src/*
  /styles/*
    -> SongBookClient/styles/*
  /auth/*
    -> registration/session/email/password endpoints
  /songs
    -> public GET; authorized + antiforgery POST
  /songs/{id}
    -> public GET; authorized + antiforgery PUT/DELETE
```

In Development, the API serves only `index.html`, `src/`, and `styles/` from
the sibling `SongBookClient` repository. Do not expose the client `.git`
directory, docs, C/C++ experiments, or arbitrary unknown files.

Point 13 replaces this development physical-file setup with the approved
production static hosting process.

### Client

```text
src/httpClient.js
  raw fetch, ApiError, JSON handling, cookies, antiforgery token

src/songsApi.js
  song endpoint wrappers only

src/authApi.js
  auth/session endpoint wrappers only

src/main.js
  auth state, UI orchestration, CRUD authorization visibility

src/songForm.js
  unchanged form/payload responsibility
```

Raw `fetch` may appear only in `httpClient.js` after this refactor.

## Files in scope

### API files to modify

```text
SongBookApi/.gitignore
SongBookApi/SongBookApi.slnx
SongBookApi/src/SongBookApi.Infrastructure/SongBookApi.Infrastructure.csproj
SongBookApi/src/SongBookApi.Service/SongBookApi.Service.csproj
SongBookApi/src/SongBookApi.Service/Program.cs
SongBookApi/src/SongBookApi.Service/appsettings.json
SongBookApi/src/SongBookApi.Service/appsettings.Development.json
SongBookApi/src/SongBookApi.Service/Endpoints/SongEndpoints.cs
SongBookApi/src/SongBookApi.Service/Extensions/ServicesExtensions.cs
```

Delete after same-origin verification:

```text
SongBookApi/src/SongBookApi.Service/Constants.cs
```

### API files to add

```text
SongBookApi/src/SongBookApi.Infrastructure/Identity/ApplicationUser.cs
SongBookApi/src/SongBookApi.Infrastructure/Identity/SongBookDbContext.cs
SongBookApi/src/SongBookApi.Infrastructure/Identity/Migrations/*
SongBookApi/src/SongBookApi.Service/Authentication/AuthConstants.cs
SongBookApi/src/SongBookApi.Service/Authentication/AntiforgeryValidationFilter.cs
SongBookApi/src/SongBookApi.Service/Authentication/IAccountEmailSender.cs
SongBookApi/src/SongBookApi.Service/Authentication/DevelopmentAccountEmailSender.cs
SongBookApi/src/SongBookApi.Service/Contracts/AuthContracts.cs
SongBookApi/src/SongBookApi.Service/Endpoints/AuthEndpoints.cs
SongBookApi/src/SongBookApi.Service/Extensions/AuthenticationExtensions.cs
SongBookApi/tests/SongBookApi.Service.Tests/SongBookApi.Service.Tests.csproj
SongBookApi/tests/SongBookApi.Service.Tests/AuthenticationTests.cs
SongBookApi/tests/SongBookApi.Service.Tests/SongAuthorizationTests.cs
SongBookApi/tests/SongBookApi.Service.Tests/TestApplicationFactory.cs
```

Equivalent names are acceptable only when responsibilities remain equally
clear and all references in this guide are updated.

### Client files to modify

```text
SongBookClient/index.html
SongBookClient/src/main.js
SongBookClient/src/songsApi.js
SongBookClient/styles/app.css
SongBookClient/styles/buttons.css
```

### Client files to add

```text
SongBookClient/src/httpClient.js
SongBookClient/src/authApi.js
```

## Phase 1 - Add Identity persistence

### Packages

Use patched package versions compatible with `net10.0`. Inspect current NuGet
versions rather than guessing a future or preview version.

Add to the Infrastructure project:

```text
Microsoft.AspNetCore.Identity.EntityFrameworkCore
Microsoft.EntityFrameworkCore.Sqlite
```

Add `Microsoft.EntityFrameworkCore.Design` to the Service startup project,
because that is the startup project used by `dotnet ef`; mark it as a private
development asset. Add the normal test SDK, xUnit, runner, and
`Microsoft.AspNetCore.Mvc.Testing` to the test project.

If the installed EF tooling version instead requires a Design reference in
both Service and Infrastructure, add it to both with `PrivateAssets="all"`
rather than exposing it as a runtime dependency.

Do not add a JavaScript package or npm manifest.

### Identity model

Create:

```csharp
public sealed class ApplicationUser : IdentityUser
{
}
```

Do not add profile fields without a product requirement.

Create `SongBookDbContext` deriving from
`IdentityDbContext<ApplicationUser>`. Keep authentication persistence separate
from the existing in-memory song repository in this point. Therefore:

- User accounts survive API restarts.
- Songs still reset when the API process restarts.

Document this difference in auth success messaging/testing so it is not
mistaken for a bug.

### Development database

Use a Development SQLite connection string named `SongBookConnection`:

```text
Data Source=App_Data/songbook.db
```

Ignore these local database artifacts:

```text
*.db
*.db-shm
*.db-wal
```

Create and commit an Identity migration. Do not use `EnsureCreated` in normal
application startup.

Migration commands:

```sh
dotnet ef migrations add AddIdentity \
  --project src/SongBookApi.Infrastructure/SongBookApi.Infrastructure.csproj \
  --startup-project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --context SongBookDbContext \
  --output-dir Identity/Migrations

dotnet ef database update \
  --project src/SongBookApi.Infrastructure/SongBookApi.Infrastructure.csproj \
  --startup-project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --context SongBookDbContext
```

Check `dotnet ef --version` first. If the tool is missing, install a compatible
10.0.x `dotnet-ef` tool only as required for the migration and report the
chosen version.

## Phase 2 - Configure Identity and cookies

Register Identity, EF stores, token providers, authentication, authorization,
antiforgery, and rate limiting through
`AuthenticationExtensions.cs`.

### Identity options

Use:

```text
User.RequireUniqueEmail = true
SignIn.RequireConfirmedEmail = true
Password.RequiredLength = 12
Password.RequireUppercase = false
Password.RequireLowercase = false
Password.RequireDigit = false
Password.RequireNonAlphanumeric = false
Lockout.AllowedForNewUsers = true
Lockout.MaxFailedAccessAttempts = 5
Lockout.DefaultLockoutTimeSpan = 15 minutes
```

The password policy favors length over forced composition. Never log submitted
passwords.

### Cookie options

Configure the Identity application cookie:

```text
Name = __Host-SongBook.Auth
HttpOnly = true
SecurePolicy = Always
SameSite = Lax
Path = /
Domain = unset
SlidingExpiration = true
ExpireTimeSpan = 8 hours
```

The `__Host-` prefix requires Secure, root Path, and no Domain.

Configure cookie redirect events so API/auth requests receive:

```text
401 for unauthenticated access
403 for forbidden access
```

They must not receive an HTML redirect to a login page.

### Authorization policy

Define one named policy:

```text
AuthenticatedUser
  -> authenticated user required
```

Because registration does not sign a user in and Identity requires confirmed
email before login, every authenticated user has passed email confirmation.

Do not add roles in this point.

## Phase 3 - Serve the client from the API origin

In `appsettings.Development.json`, configure the sibling client root:

```text
../../../SongBookClient
```

Resolve it relative to the API content root, convert it to an absolute path,
and fail startup with a clear Development error when it does not exist.

Serve:

- `/` as the client's `index.html`.
- `/src/*` from the client's `src` directory.
- `/styles/*` from the client's `styles` directory.

Use explicit physical file providers for those paths. Do not enable directory
browsing or `ServeUnknownFileTypes`.

After same-origin hosting works:

1. Remove `AddCors` and `UseCors` from `Program.cs`.
2. Remove every `.RequireCors(...)` call from song endpoints.
3. Delete `ServiceConstants` when it has no remaining purpose.
4. Change the client song collection URL from
   `https://localhost:7152/songs` to `/songs`.
5. Stop using lite-server for point-11 runtime validation.

Required middleware order:

```text
HTTPS redirection
Development static/default files
routing
rate limiter
authentication
authorization
mapped auth and song endpoints
```

Call `app.UseRateLimiter()` in the rate-limiter position. Merely attaching
named policies with `RequireRateLimiting` is not sufficient.

Antiforgery is explicitly validated by the reusable endpoint filter described
below.

## Phase 4 - Add antiforgery protection

Configure antiforgery with:

```text
HeaderName = X-CSRF-TOKEN
Cookie.Name = __Host-SongBook.Antiforgery
Cookie.SecurePolicy = Always
Cookie.SameSite = Lax
Cookie.Path = /
```

The antiforgery cookie may remain HTTP-only; the request token is returned in
JSON and stored only in JavaScript memory.

Create:

```text
GET /auth/antiforgery
```

It calls `IAntiforgery.GetAndStoreTokens` and returns:

```json
{
  "token": "<request-token>"
}
```

Return `Cache-Control: no-store` so the response token is not cached by the
browser or an intermediary.

Create one reusable endpoint filter that calls
`IAntiforgery.ValidateRequestAsync` and rejects a missing/invalid token with a
safe `400` Problem Details response.

Apply the filter to every state-changing endpoint:

```text
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/resend-confirmation
POST /auth/forgot-password
POST /auth/reset-password
POST /songs
PUT /songs/{id}
DELETE /songs/{id}
```

Do not require antiforgery on GET requests.

## Phase 5 - Add account and session endpoints

Map all endpoints under `/auth`. Use request records in
`AuthContracts.cs`; never return `ApplicationUser`, password hashes, security
stamps, tokens, or cookie values.

### Endpoint contract

| Method | Path | Access | Success |
| --- | --- | --- | --- |
| `GET` | `/auth/antiforgery` | Anonymous | `200 { token }` |
| `GET` | `/auth/me` | Anonymous | `200` session summary |
| `POST` | `/auth/register` | Anonymous + antiforgery | `202` |
| `GET` | `/auth/confirm-email` | Confirmation token | Redirect to `/` |
| `POST` | `/auth/resend-confirmation` | Anonymous + antiforgery | `202` |
| `POST` | `/auth/login` | Anonymous + antiforgery | `204` + auth cookie |
| `POST` | `/auth/logout` | Authenticated + antiforgery | `204` |
| `POST` | `/auth/forgot-password` | Anonymous + antiforgery | `202` |
| `POST` | `/auth/reset-password` | Anonymous + antiforgery | `204` |

`GET /auth/me` always returns `200`:

```json
{
  "isAuthenticated": true,
  "email": "user@example.com"
}
```

or:

```json
{
  "isAuthenticated": false,
  "email": null
}
```

### Registration

Request:

```json
{
  "email": "user@example.com",
  "password": "a sufficiently long password"
}
```

Normalize email through Identity. Return validation errors with
`ValidationProblem`. On success:

1. Create the user.
2. Generate an email-confirmation token.
3. Base64Url-encode the token before placing it in a URL.
4. Send a same-origin confirmation link.
5. Return `202`; do not sign the user in.

### Email confirmation

The confirmation link targets:

```text
GET /auth/confirm-email?userId=...&code=...
```

Decode and confirm the token, then redirect:

```text
/?auth=confirmed
```

For an invalid/expired link, redirect:

```text
/?auth=confirmation-failed
```

Do not put the token in the final redirected URL.

### Login

Request:

```json
{
  "email": "user@example.com",
  "password": "the password",
  "rememberMe": false
}
```

Use `PasswordSignInAsync` with lockout-on-failure enabled.

- Return `204` on success.
- Return the same generic `401` for invalid credentials, unknown users,
  unconfirmed users, and other not-allowed sign-in states.
- Offer the separate always-`202` resend-confirmation action in the UI rather
  than revealing account state through the login response.
- Do not reveal whether a random email exists.

### Resend confirmation and forgot password

Both endpoints accept an email and always return `202`, whether or not the
account exists. Send mail only when the relevant user/account state permits
it.

### Password reset

Generate a Base64Url-encoded reset token and send a same-origin link containing
email and token at:

```text
/?auth=reset-password&email=...&code=...
```

The root entry page therefore handles the link without requiring an SPA
fallback route. The client reads the values once, removes them from the visible
URL with `history.replaceState`, and submits:

```json
{
  "email": "user@example.com",
  "code": "<encoded-token>",
  "newPassword": "new sufficiently long password"
}
```

Return `204` on success and `ValidationProblem` for an invalid/expired token or
invalid password.

### Logout

Require the `AuthenticatedUser` policy, validate antiforgery, sign out the
Identity application scheme, and return `204`.

## Phase 6 - Add development email delivery

`IAccountEmailSender` exposes only the operations needed by this application:

```text
SendConfirmationLinkAsync(email, link)
SendPasswordResetLinkAsync(email, link)
```

`DevelopmentAccountEmailSender` writes the recipient and generated link to the
API Development log. It must:

- Never log a password.
- Be registered only in Development.
- Make clear that logged links are sensitive one-time development tokens.

Point 13 must replace this logger with a real email provider before public
deployment. The application is not production-ready while confirmation/reset
links exist only in logs.

## Phase 7 - Protect song writes

Refactor song route mapping into a route group if that makes policy/filter
application clearer.

Required endpoint behavior:

| Endpoint | Anonymous result | Confirmed signed-in result |
| --- | --- | --- |
| `GET /songs` | Existing `200` behavior | Existing `200` behavior |
| `GET /songs/{id}` | Existing `200/404` behavior | Existing `200/404` behavior |
| `POST /songs` | `401` | Existing `201/400`, with valid antiforgery token |
| `PUT /songs/{id}` | `401` | Existing `204/404`, with valid antiforgery token |
| `DELETE /songs/{id}` | `401` | Existing `204/404`, with valid antiforgery token |

Apply both:

```text
RequireAuthorization(AuthConstants.AuthenticatedUserPolicy)
AntiforgeryValidationFilter
```

Do not protect public reads and do not change their response bodies.

Add rate-limiter policies:

- Login: at most 10 attempts per minute per remote IP, in addition to Identity
  user lockout.
- Registration/resend/forgot-password: at most 5 requests per 15 minutes per
  remote IP.

Return standard `429` when a limiter rejects a request.

## Phase 8 - Refactor the client HTTP layer

### `httpClient.js`

Move `ApiError` and the shared response parsing from `songsApi.js` into this
module.

Export:

```text
ApiError
request
resetAntiforgeryToken
```

`request(url, options)` must:

1. Use `credentials: "same-origin"`.
2. Add JSON headers only when sending JSON.
3. For unsafe methods, obtain/cache a token from `/auth/antiforgery` and send
   it as `X-CSRF-TOKEN`.
4. Preserve the existing `204`, JSON, network-error, and `ApiError` behavior.
5. Never read or write auth state in `localStorage` or `sessionStorage`.

Do not send an antiforgery token for GET/HEAD.

The token is cached only in module memory. Call
`resetAntiforgeryToken()` after successful login and logout because Identity
changes the principal associated with antiforgery validation. The next unsafe
request obtains a new token.

### `songsApi.js`

- Import `request` and `ApiError` as needed.
- Use relative `/songs` URLs.
- Keep the same five public song functions.
- Mark POST/PUT/DELETE as unsafe so `httpClient` adds antiforgery.

### `authApi.js`

Export:

```text
getCurrentUser()
registerAccount(payload)
login(payload)
logout()
resendConfirmation(email)
requestPasswordReset(email)
resetPassword(payload)
```

Use only relative `/auth/...` URLs and the shared request helper.

## Phase 9 - Add authentication UI

### Required client state

Extend the point-03 state with:

```js
auth: {
  status: "loading",
  email: null
},
authView: "none",
isAuthPending: false
```

Allowed auth statuses:

```text
loading
anonymous
authenticated
```

Allowed auth views:

```text
none
login
register
resend-confirmation
forgot-password
reset-password
```

### Required HTML IDs

Add semantic, labelled controls:

| ID | Purpose |
| --- | --- |
| `auth-summary` | Current session text |
| `show-login-button` | Opens login form |
| `show-register-button` | Opens registration form |
| `logout-button` | Ends current session |
| `auth-panel` | Container for the active auth form |
| `auth-panel-heading` | Active form heading |
| `close-auth-panel-button` | Closes auth form |
| `login-form` | Email/password/remember-me form |
| `login-email` | Login email |
| `login-password` | Current password |
| `login-remember-me` | Persistent-cookie choice |
| `register-form` | Registration form |
| `register-email` | Registration email |
| `register-password` | New password |
| `register-confirm-password` | Client-only password confirmation |
| `resend-confirmation-form` | Resend email form |
| `forgot-password-form` | Password-reset request form |
| `reset-password-form` | New-password/token form |
| `reset-password-email` | Email loaded from reset link |
| `reset-password-code` | Hidden/in-memory reset token |
| `reset-password-new-password` | New password |
| `reset-password-confirm-password` | Client-only confirmation |

Use normal page sections/forms, not a custom modal. Every input needs a visible
label and appropriate autocomplete:

```text
email / username
current-password
new-password
```

Password confirmation is checked in the client but never sent to the server.

### Startup and session behavior

At initialization:

1. Load `getCurrentUser()` and public songs independently.
2. Render public song reads even if session loading fails.
3. Show write controls only when `auth.status === "authenticated"`.
4. For anonymous users, show a concise "Sign in to create or edit songs"
   message.

Do not hide the public song list while auth status loads.

### Auth action behavior

- Registration success keeps the user anonymous and instructs them to use the
  confirmation link from email.
- Confirmation redirect query values produce a success/failure notice, then
  are removed with `history.replaceState`.
- Login success resets the antiforgery cache, reloads `/auth/me`, closes the
  auth panel, and reveals write actions.
- Logout cancels any open create/edit draft, clears selected write UI, resets
  antiforgery cache, reloads `/auth/me`, and keeps public reads visible.
- Forgot-password and resend-confirmation always show a generic "If the
  account is eligible, an email was sent" message.
- A reset link opens the reset form, stores email/code only in memory, and
  removes sensitive query values from the address bar/history entry.
- A mutation `401` preserves unsaved form data, refreshes auth state, and opens
  login.
- A mutation `403` preserves data and explains that access is not allowed.

Never display passwords, auth cookies, confirmation tokens, or reset tokens in
the page or console.

## Phase 10 - Add automated server tests

Create an integration test project using `WebApplicationFactory<Program>`.
Make `Program` discoverable with a public partial declaration.

The test factory must:

- Replace the normal auth database with an isolated SQLite in-memory database.
- Open one shared `SqliteConnection("DataSource=:memory:")` and retain it for
  the factory lifetime so schema and data survive across requests.
- Replace `IAccountEmailSender` with a fake that captures links in memory.
- Preserve cookie handling in the test client.
- Use an HTTPS test-client base address such as `https://localhost/` so
  `Secure`/`__Host-` cookies are returned. Do not weaken production cookie
  options merely to make tests pass.
- Force the Development environment for static-file coverage and override the
  configured client root with a controlled test fixture path. Tests must not
  depend on a sibling checkout existing in CI.
- Allow tests to request and send real antiforgery tokens.
- Reset state between tests.

Required tests:

1. `GET /songs` works anonymously.
2. Anonymous POST/PUT/DELETE return `401`.
3. Registration creates an unconfirmed user and returns `202`.
4. Unconfirmed user cannot log in or modify songs.
5. Captured confirmation link confirms the user.
6. Confirmed user can log in and `/auth/me` reports the email.
7. Authenticated mutation without antiforgery returns `400`.
8. Authenticated mutation with antiforgery reaches existing CRUD behavior.
9. Logout invalidates the session; the next mutation returns `401`.
10. Invalid credentials do not reveal whether the email exists.
11. Forgot-password response is identical for existing and unknown emails.
12. Captured password-reset link permits setting a new password.
13. Public registration validation returns safe structured errors.
14. `/` and required client module/style paths are served from the API origin
    in Development.

Do not assert raw cookie or token values in snapshots/log output.

## Acceptance criteria

- [ ] The client loads from `https://localhost:7152/` without lite-server.
- [ ] No CORS configuration remains necessary for the final Development flow.
- [ ] Public users can list and view songs.
- [ ] Anonymous song writes return `401` without redirect HTML.
- [ ] Public registration works and does not automatically sign in.
- [ ] Unconfirmed users cannot log in or write.
- [ ] Confirmation permits login.
- [ ] Confirmed users can create, update, and delete with antiforgery tokens.
- [ ] Missing/invalid antiforgery tokens reject state-changing requests.
- [ ] Logout invalidates the session and hides write controls.
- [ ] Password reset works through a one-time emailed link.
- [ ] Auth cookies never appear in JavaScript storage.
- [ ] Existing unsaved song data survives an auth-expiration `401`.
- [ ] Integration tests cover auth, authorization, email, cookies, and CSRF.
- [ ] Development email links are clearly non-production.

## Validation commands

From the API repository:

```sh
dotnet restore SongBookApi.slnx
dotnet build SongBookApi.slnx
dotnet test SongBookApi.slnx
dotnet ef migrations list \
  --project src/SongBookApi.Infrastructure/SongBookApi.Infrastructure.csproj \
  --startup-project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --context SongBookDbContext
```

From the client repository:

```sh
node --check src/httpClient.js
node --check src/authApi.js
node --check src/songsApi.js
node --check src/songForm.js
node --check src/main.js
rg "fetch\\(" src --glob "*.js"
rg "localStorage|sessionStorage|localhost:7152|localhost:3000" src index.html
```

Expected searches:

- Raw `fetch(` appears only in `src/httpClient.js`.
- No auth value uses browser storage.
- Client source contains no hard-coded localhost origin after conversion to
  relative URLs.

## Browser acceptance script

1. Apply the Identity migration and start only the API HTTPS profile.
2. Open `https://localhost:7152/`.
3. Confirm songs can be listed while signed out.
4. Confirm New/Edit/Delete are unavailable while signed out.
5. Register an email and strong password.
6. Confirm registration does not sign in.
7. Try login before confirmation and observe the same generic login failure
   used for invalid credentials; use the resend-confirmation action when
   needed.
8. Copy the Development confirmation link from API logs and open it.
9. Log in and confirm write controls appear.
10. Create, edit, and delete a song; inspect cookie and antiforgery behavior in
    the Network panel.
11. Log out and confirm reads remain while writes become unavailable.
12. Request a password reset for both known and unknown email addresses; the
    visible response must be equivalent.
13. Open the Development reset link, set a new password, and log in with it.
14. Expire/remove the auth cookie during an unsaved edit, attempt Save, and
    confirm the draft remains while login is requested.
15. Confirm no password/token is printed by client console logging.

## Non-goals

- Do not add bearer/JWT tokens, refresh tokens, OAuth/social login, MFA,
  passkeys, roles, administrator approval, invitations, or private reads.
- Do not put auth data in `localStorage` or `sessionStorage`.
- Do not use cross-origin credentialed CORS.
- Do not migrate songs into the Identity database yet; point 12 owns that
  schema and repository change.
- Do not implement a production email provider or production static hosting;
  point 13 owns those.
- Do not silently seed a default password or commit user credentials.

## Learning notes

- A secure cookie is intentionally unreadable to JavaScript; the browser sends
  it automatically to the same origin.
- SameSite cookies reduce cross-site requests but do not replace antiforgery
  validation.
- Password hashing and token generation belong to Identity, not custom client
  JavaScript.
- A `401` means the user is not authenticated. A `403` means the server knows
  the user but refuses the operation.
- Email confirmation proves control of an inbox; it does not prove a real-world
  identity.
- Authorization must be enforced by the API even when the client hides a
  button.

## Resources

- [Microsoft: Introduction to Identity on ASP.NET Core](https://learn.microsoft.com/aspnet/core/security/authentication/identity)
- [Microsoft: Account confirmation and password recovery](https://learn.microsoft.com/aspnet/core/security/authentication/accconfirm)
- [Microsoft: Cookie authentication](https://learn.microsoft.com/aspnet/core/security/authentication/cookie)
- [Microsoft: Antiforgery in ASP.NET Core](https://learn.microsoft.com/aspnet/core/security/anti-request-forgery)
- [Microsoft: Authorization](https://learn.microsoft.com/aspnet/core/security/authorization/introduction)
- [Microsoft: EF Core migrations](https://learn.microsoft.com/ef/core/managing-schemas/migrations/)
- [Microsoft: Rate limiting middleware](https://learn.microsoft.com/aspnet/core/performance/rate-limit)
- [OWASP: Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP: Cross-Site Request Forgery Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

## Checkpoint

This point is complete when a user can register, confirm email, log in, recover
a password, and log out; public reads remain available; every write is
authorized and antiforgery-protected; and automated tests prove the security
boundaries.
