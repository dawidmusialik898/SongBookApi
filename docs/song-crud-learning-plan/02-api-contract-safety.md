# 02 - API Contract Safety

## Goal

Make the existing API contract safe enough for a browser editor before the
remaining client CRUD flows are implemented.

This is an API-focused stage. It must be completed before points 04 and 07 rely
on update and part identity behavior.

## Baseline contract

On the current API branch, JSON uses this shape:

```text
Song
  id: GUID
  title: string or null
  author: string or null
  originalTitle: string or null
  number: string or null
  key: string or null
  tempo: string or null
  parts: Part[] or null

Part
  id: GUID
  name: string or null
  text: string or null
```

There is no `Song.order` property on this branch. The order of entries in
`parts` is the display order. Remove stale `order` fields from examples rather
than adding that property back.

The API exposes:

| Method | Path | Success | Missing record |
| --- | --- | --- | --- |
| `GET` | `/songs` | `200` plus array | Not applicable |
| `GET` | `/songs/{id}` | `200` plus song | `404` |
| `POST` | `/songs` | `201` plus created song | Not applicable |
| `PUT` | `/songs/{id}` | `204` | `404` |
| `DELETE` | `/songs/{id}` | `204` | `404` |

## Problems to fix

### Route ID is ignored by update

`SongEndpoints.UpdateSong` passes the route ID to
`SongService.UpdateSongAsync`, but the service currently forwards only the
deserialized `Song` to the repository. Because the `Song` constructor creates
a GUID, a body without `id` tries to update a random record.

The required rule is:

```text
PUT /songs/{routeId}
-> routeId is authoritative
-> body id is ignored
-> repository receives a Song whose Id equals routeId
```

A request to song A's route must never update song B, even if the body contains
B's ID.

### Existing part IDs cannot round-trip

`Part.Id` has no setter. JSON deserialization therefore cannot restore an
existing part ID submitted by the client. Editing a song can silently replace
all part identities.

For this stage, use the minimal compatible rule:

- Change `Part.Id` to a public get/set property.
- Keep the constructor-generated GUID as the default for a new part.
- Existing part IDs sent by the client are restored by JSON.
- New part payloads omit `id`; the server constructor supplies it.
- The client never generates a persistent part GUID.

## Files in scope

Required API files:

```text
SongBookApi/src/SongBookApi.Domain/Dto/Part.cs
SongBookApi/src/SongBookApi.Domain/Services/ISongService.cs
SongBookApi/src/SongBookApi.Service/SongBookApi.Service.http
SongBookApi/utils/simpleCurl.ps1
```

Inspect, but change only if necessary:

```text
SongBookApi/src/SongBookApi.Domain/Dto/Song.cs
SongBookApi/src/SongBookApi.Domain/Repositories/ISongRepository.cs
SongBookApi/src/SongBookApi.Infrastructure/Repositories/InMemorySongRepository.cs
SongBookApi/src/SongBookApi.Service/Endpoints/SongEndpoints.cs
```

No client production file should change in this stage.

## Required implementation sequence

1. In `SongService.UpdateSongAsync(Guid id, Song songDto)`, overwrite
   `songDto.Id` with the route `id` before calling the repository.
2. Keep `ISongRepository.UpdateSongAsync(Song song)` unchanged unless a
   compelling implementation issue is discovered.
3. Change `Part.Id` from getter-only to `get; set;`, retaining constructor GUID
   generation.
4. Do not add `Order` to `Song`.
5. Replace the stale weather-forecast request in
   `SongBookApi.Service.http` with executable song CRUD examples.
6. Remove `"order": []` from `utils/simpleCurl.ps1`.
7. Make example update bodies demonstrate that the route is authoritative.
8. Build the API and run the manual contract scenarios below.

## Request body rules for later client stages

These rules become the contract consumed by points 04 and 07:

### Create song

```json
{
  "title": "Amazing Grace",
  "author": "John Newton",
  "originalTitle": null,
  "number": "1",
  "key": "G",
  "tempo": "Moderate",
  "parts": [
    {
      "name": "Verse 1",
      "text": "..."
    }
  ]
}
```

- Omit song `id`.
- Omit `id` for every new part.
- Do not send `order`.

### Update song

```json
{
  "title": "Amazing Grace",
  "author": "John Newton",
  "originalTitle": null,
  "number": "1",
  "key": "A",
  "tempo": "Moderate",
  "parts": [
    {
      "id": "<existing-part-id>",
      "name": "Verse 1",
      "text": "Updated text"
    },
    {
      "name": "Chorus",
      "text": "New part"
    }
  ]
}
```

- Song identity comes only from `/songs/{id}`.
- Existing parts include their IDs.
- New parts omit IDs.
- Array position is the saved display order.

## Validation policy

Do not invent new business validation in this stage. The current API permits
nullable scalar fields, so the client will also permit them. In particular:

- `title` remains optional.
- Blank optional client fields will later map to `null`.
- No uniqueness rule is added for `number`.
- Empty or null `parts` remain accepted.

API validation DTOs and formal length limits are valuable future work, but
adding them now would expand the contract beyond the client CRUD task.

## Manual contract scenarios

Run the API with its HTTPS profile, then verify:

### Route identity

1. Create song A and record its ID.
2. Create song B and record its ID.
3. Send `PUT /songs/{A-id}` with `"id": "{B-id}"` in the body.
4. Fetch A and B.
5. A must contain the submitted changes; B must remain unchanged.

### Part identity

1. Create a song with one part.
2. Fetch the song and record the returned part ID.
3. Update the part text while sending that part ID.
4. Fetch the song again.
5. The part text must change and its ID must remain equal to the recorded ID.

### New part identity

1. Update an existing song with one additional part that has no `id`.
2. Fetch the song.
3. The new part must have a non-empty server-generated ID.

### Missing route

Send `PUT` for a valid but unknown GUID. The response must remain `404`; no new
song may be created.

## Validation commands

```sh
dotnet build SongBookApi.slnx
```

Then execute the updated `.http` file or `utils/simpleCurl.ps1`. An AI model
running on Linux may translate the PowerShell examples to equivalent `curl`
commands, but it must preserve the same payloads and assertions.

## Acceptance criteria

- [ ] `PUT` always updates by route ID.
- [ ] A conflicting body ID cannot redirect the update.
- [ ] Unknown route IDs return `404`.
- [ ] Existing part IDs survive an edit.
- [ ] New parts receive server-generated IDs.
- [ ] Part array order survives create and update.
- [ ] No request or documentation example sends `order`.
- [ ] The API solution builds successfully.

## Non-goals

- Do not introduce a database.
- Do not add authentication or authorization.
- Do not add `Song.order`.
- Do not redesign all domain objects into request/response DTOs.
- Do not add speculative validation rules.
- Do not change endpoint paths or success status codes.

## Alternatives

A stronger long-term design uses separate create/update request DTOs and
response DTOs so request bodies never expose server-owned song identity. That
is appropriate before a public production API, but the minimal changes above
are the selected implementation for this learning branch.

If part identity is later found unnecessary, `Part.Id` could be removed from
the public contract. Do not make that decision while the property is already
exposed and the client is being designed to preserve it.

## Resources

- [MDN: HTTP `PUT` method](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods/PUT)
- [Microsoft: Model binding in ASP.NET Core](https://learn.microsoft.com/aspnet/core/mvc/models/model-binding)
- [Microsoft: System.Text.Json overview](https://learn.microsoft.com/dotnet/standard/serialization/system-text-json/overview)

## Checkpoint

This point is complete when route and part identity pass all manual scenarios
and the examples describe the actual no-`order` contract.
