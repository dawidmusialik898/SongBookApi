# 01 - Local API Integration

## Goal

Provide a stable browser origin and a working HTTPS/CORS connection between
the vanilla client and the ASP.NET Core API.

## Status on the baseline branch

**Complete.** This point is verification-only unless a later change breaks the
local integration.

The checked-in implementation currently uses:

| Component | Value |
| --- | --- |
| Client development server | globally installed `lite-server` |
| Client origin | `http://localhost:3000` |
| Alternative loopback origin | `http://127.0.0.1:3000` |
| API HTTPS origin | `https://localhost:7152` |
| Songs collection URL | `https://localhost:7152/songs` |
| CORS policy constant | `ServiceConstants.SongBookClientPolicyName` |

`SongBookApi/src/SongBookApi.Service/Program.cs` registers a named CORS policy
for the two client origins and applies it in Development.
`SongBookClient/src/songsApi.js` defines the songs URL once.

## Prerequisites

- The API branch is `feature/copilot-experimentation`.
- The client branch is `feature/copilot-experimentation`.
- The ASP.NET Core HTTPS development certificate is trusted.
- `lite-server` is available globally.

Check the tools without starting the server:

```sh
dotnet --version
node --version
npm list --global lite-server --depth=0
```

## Files in scope

Verification should inspect:

```text
SongBookApi/SongBookApi.slnx
SongBookApi/src/SongBookApi.Service/Program.cs
SongBookApi/src/SongBookApi.Service/Constants.cs
SongBookApi/src/SongBookApi.Service/Endpoints/SongEndpoints.cs
SongBookApi/src/SongBookApi.Service/Properties/launchSettings.json
SongBookApi/tests/SongBookApi.Service.Tests/SongBookApiFactory.cs
SongBookApi/tests/SongBookApi.Service.Tests/CorsIntegrationTests.cs
SongBookClient/src/songsApi.js
```

Do not change unrelated endpoint, repository, or UI behavior in this point.

## Required implementation state

The implementation must continue to satisfy all of these rules:

1. `AddCors` registers a named policy, not a wildcard policy.
2. The policy permits exactly the current local client origins:
   `http://localhost:3000` and `http://127.0.0.1:3000`.
3. JSON headers and all current CRUD methods are permitted.
4. CORS middleware runs before song endpoints are executed.
5. CORS remains a development concern; point 11 replaces the final local
   workflow with same-origin hosting and point 13 owns production behavior.
6. The client calls the HTTPS API and does not use `mode: "no-cors"`.
7. The songs collection URL exists in one frontend constant, not once per
   request function.
8. The client is opened through lite-server, not as a `file://` document.

The current branch applies the same named policy globally with `UseCors` and
also attaches policy metadata with `RequireCors` on each song endpoint. That is
redundant but functional. Do not refactor it as part of this completed stage
unless the refactor is separately requested and the CORS checks below remain
green.

## Start commands

Run the API from the API repository:

```sh
dotnet run \
  --project src/SongBookApi.Service/SongBookApi.Service.csproj \
  --launch-profile https
```

Run the client from the client repository in another terminal:

```sh
lite-server
```

Open:

```text
http://localhost:3000
```

If the browser does not trust the local API certificate:

```sh
dotnet dev-certs https --trust
```

Then visit `https://localhost:7152/songs` directly once and resolve any browser
warning. Browser `fetch` has no equivalent of curl's `-k`.

## Validation commands

Build the API:

```sh
dotnet build src/SongBookApi.Service/SongBookApi.Service.csproj
```

Run the automated integration tests:

```sh
dotnet test tests/SongBookApi.Service.Tests/SongBookApi.Service.Tests.csproj
```

With the API running, verify a permitted simple request:

```sh
curl --insecure --include \
  --header "Origin: http://localhost:3000" \
  https://localhost:7152/songs
```

The response must include:

```text
Access-Control-Allow-Origin: http://localhost:3000
```

Verify the JSON `POST` preflight:

```sh
curl --insecure --include --request OPTIONS \
  --header "Origin: http://localhost:3000" \
  --header "Access-Control-Request-Method: POST" \
  --header "Access-Control-Request-Headers: content-type" \
  https://localhost:7152/songs
```

It must return `204` and allow the origin, `POST`, and `content-type`.

Verify that an unknown origin is not allowed:

```sh
curl --insecure --include --request OPTIONS \
  --header "Origin: http://localhost:3001" \
  --header "Access-Control-Request-Method: POST" \
  https://localhost:7152/songs
```

It may return `204`, but it must not include
`Access-Control-Allow-Origin: http://localhost:3001`.

## Acceptance criteria

- [x] A configured port-3000 origin loads through lite-server.
- [x] The client requests `GET https://localhost:7152/songs`.
- [x] The request succeeds without a CORS or certificate error.
- [x] The existing create request completes from the client origin.
- [x] Its preflight succeeds and the API receives JSON.
- [x] No request is sent to port `5068` or an obsolete client port.

## Common failures

| Symptom | Likely cause | Check |
| --- | --- | --- |
| CORS error | lite-server is using a different port or host. | Browser address and `WithOrigins`. |
| `Failed to fetch` | API stopped or HTTPS certificate untrusted. | Open the API URL directly. |
| `404` | Incorrect API path or launch profile. | Network request URL and `launchSettings.json`. |
| ES module error | Client opened with `file://`. | Start lite-server from the client root. |
| Preflight lacks allow headers | CORS middleware/policy no longer applies. | `Program.cs` ordering and policy name. |

## Non-goals

- Do not introduce a proxy, package manifest, bundler, or environment-file
  system.
- Do not broaden CORS to every origin.
- Do not use an insecure browser workaround.
- Do not design production hosting here; point 13 owns that decision.

## Alternatives

Serving the client from the API origin would eliminate local CORS, but it is
not the chosen development setup on this branch. Changing to that model is a
separate architectural task, not part of verifying point 01.

## Resources

- [MDN: Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
- [Microsoft: Enable CORS in ASP.NET Core](https://learn.microsoft.com/aspnet/core/security/cors)
- [Microsoft: Trust the ASP.NET Core HTTPS development certificate](https://learn.microsoft.com/aspnet/core/security/enforcing-ssl)

## Implementation record

Completed on 2026-07-27.

API changes:

- Added `public partial class Program` so the running minimal API can be hosted
  by `WebApplicationFactory` without changing runtime behavior.
- Added `SongBookApi.Service.Tests` to the solution.
- Added a Development test factory and seven CORS integration cases.

Automated coverage proves:

- Both configured client origins receive the matching allow-origin header.
- An unknown port-3001 origin receives no CORS permission.
- `POST`, `PUT`, and `DELETE` JSON preflights return the expected method,
  header, and origin permissions.
- A real `POST /songs` request returns `201` with the allowed-origin header.

Functional checks proved:

- lite-server returned the client entry page from port 3000.
- The HTTPS API returned the allow-origin header for the configured client.
- The denied origin received no allow-origin header.
- All CRUD preflights returned `204`.
- A live cross-origin JSON create request returned `201`.

There is no useful unit test for this stage because the behavior is ASP.NET
Core middleware integration rather than an isolated calculation. The solution
still reports the pre-existing high-severity transitive `Microsoft.OpenApi`
advisory; point 13 requires resolving or explicitly accepting it before
production.

## Checkpoint

This point remains complete while the browser can perform both simple and
preflighted requests from lite-server at port 3000 and unlisted origins receive
no CORS permission.
