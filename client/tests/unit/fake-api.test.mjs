import assert from "node:assert/strict"
import test from "node:test"

import { createFakeApi } from "../helpers/fakeApi.mjs"

test("private routes require a session and mutations require antiforgery", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.book({
        owner: "owner@example.com",
        name: "Private book"
    })

    assert.equal(
        (await send(api, "GET", "/songbooks")).status,
        401
    )
    assert.equal(
        (await send(api, "GET", "/admin/users")).status,
        401
    )

    const token = await getAntiforgeryToken(api)
    api.signIn("owner@example.com")
    const rejected = await send(api, "POST", "/songbooks", {
        body: { name: "Missing token" }
    })
    assert.equal(rejected.status, 400)
    assert.equal((await rejected.json()).title, "Invalid antiforgery token.")

    const created = await send(api, "POST", "/songbooks", {
        body: { name: "New book" },
        headers: tokenHeaders(token)
    })
    assert.equal(created.status, 201)
    assert.equal((await created.json()).name, "New book")
})

test("book access, duplicate names, ordering, and 50-item pages match the API", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("reader@example.com")
    api.seed.account("other-owner@example.com")

    for (let index = 0; index < 51; index++) {
        api.seed.book({
            owner: "owner@example.com",
            name: `Book ${String(index).padStart(2, "0")}`
        })
    }
    const sharedBookId = api.seed.book({
        owner: "owner@example.com",
        name: "Sunday Service"
    })
    api.seed.access(sharedBookId, "reader@example.com", "reader")

    api.signIn("owner@example.com")
    const token = await getAntiforgeryToken(api)
    const firstPage = await send(api, "GET", "/songbooks")
    const firstPageBody = await firstPage.json()
    const secondPage = await send(api, "GET", "/songbooks", {
        query: { page: 2 }
    })
    const secondPageBody = await secondPage.json()

    assert.equal(firstPageBody.items.length, 50)
    assert.equal(firstPageBody.hasNext, true)
    assert.equal(secondPageBody.items.length, 2)
    assert.equal(secondPageBody.hasNext, false)
    assert.deepEqual(
        [...firstPageBody.items, ...secondPageBody.items].map(book => book.name),
        [...firstPageBody.items, ...secondPageBody.items]
            .map(book => book.name)
            .sort()
    )

    const duplicate = await send(api, "POST", "/songbooks", {
        body: { name: " sunday service " },
        headers: tokenHeaders(token)
    })
    assert.equal(duplicate.status, 409)

    assert.equal(
        (await send(api, "PUT", `/songbooks/${sharedBookId}`, {
            body: { name: "Sunday Service updated" },
            headers: tokenHeaders(token)
        })).status,
        204
    )
    const accessUrl = `/songbooks/${sharedBookId}/access`
    const accessList = await send(api, "GET", accessUrl)
    const accessListBody = await accessList.json()
    assert.equal(accessListBody.items.length, 1)
    assert.equal(accessListBody.items[0].email, "reader@example.com")
    assert.equal(
        (await send(api, "PUT", accessUrl, {
            body: {
                email: "reader@example.com",
                accessLevel: "editor"
            },
            headers: tokenHeaders(token)
        })).status,
        200
    )

    const disposableBookId = api.seed.book({
        owner: "owner@example.com",
        name: "Disposable"
    })
    assert.equal(
        (await send(api, "DELETE", `/songbooks/${disposableBookId}`, {
            headers: tokenHeaders(token)
        })).status,
        204
    )
    assert.equal(
        (await send(api, "GET", `/songbooks/${disposableBookId}`)).status,
        404
    )

    api.signIn("other-owner@example.com")
    const sameNameForDifferentOwner = await send(api, "POST", "/songbooks", {
        body: { name: "Sunday Service" },
        headers: tokenHeaders(token)
    })
    assert.equal(sameNameForDifferentOwner.status, 201)

    api.signIn("reader@example.com")
    const shared = await send(api, "GET", `/songbooks/${sharedBookId}`)
    assert.equal((await shared.json()).accessLevel, "editor")
    assert.equal(
        (await send(api, "GET", "/songbooks/book-1")).status,
        404
    )
    assert.equal(
        (await send(api, "PUT", `/songbooks/${sharedBookId}`, {
            body: { name: "Reader rename" },
            headers: tokenHeaders(token)
        })).status,
        403
    )

    api.signIn("owner@example.com")
    const accessMembers = await send(api, "GET", accessUrl)
    const accessMember = (await accessMembers.json()).items[0]
    assert.equal(
        (await send(api, "DELETE", `${accessUrl}/${accessMember.id}`, {
            headers: tokenHeaders(token)
        })).status,
        204
    )
    api.signIn("reader@example.com")
    assert.equal(
        (await send(api, "GET", `/songbooks/${sharedBookId}`)).status,
        404
    )
})

test("song search folds Polish text, pages results, and returns adjacent songs", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("reader@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Songs"
    })
    api.seed.access(bookId, "reader@example.com", "reader")
    api.seed.song(bookId, {
        id: "song-null-title",
        title: null
    })
    api.seed.song(bookId, {
        id: "song-amazing",
        title: "Amazing Grace",
        author: "John Newton",
        number: "1"
    })
    api.seed.song(bookId, {
        id: "song-zebra",
        title: "Zebra"
    })
    api.seed.song(bookId, {
        id: "song-lodz",
        title: "Łódź",
        author: "Kraków"
    })

    api.signIn("reader@example.com")
    const baseUrl = `/songbooks/${bookId}/songs`
    const allSongs = await send(api, "GET", baseUrl)
    assert.deepEqual(
        (await allSongs.json()).items.map(song => song.id),
        ["song-null-title", "song-amazing", "song-zebra", "song-lodz"]
    )

    const token = await getAntiforgeryToken(api)
    const missingToken = await send(api, "POST", baseUrl, {
        body: { title: "Reader cannot create", parts: [] }
    })
    assert.equal(missingToken.status, 400)

    const foldedSearch = await send(api, "GET", baseUrl, {
        query: { search: "  AMAZING   newton " }
    })
    assert.deepEqual(
        (await foldedSearch.json()).items.map(song => song.id),
        ["song-amazing"]
    )
    const polishSearch = await send(api, "GET", baseUrl, {
        query: { search: "lodz\tKRAKOW" }
    })
    assert.deepEqual(
        (await polishSearch.json()).items.map(song => song.id),
        ["song-lodz"]
    )
    const noMatch = await send(api, "GET", baseUrl, {
        query: { search: "amazing nonexistent" }
    })
    assert.deepEqual((await noMatch.json()).items, [])
    assert.equal(
        (await send(api, "GET", baseUrl, {
            query: { search: "x".repeat(101) }
        })).status,
        400
    )

    const adjacent = await send(
        api,
        "GET",
        `${baseUrl}/song-amazing/adjacent`
    )
    assert.deepEqual(await adjacent.json(), {
        previous: {
            id: "song-null-title",
            title: null,
            author: null,
            number: null
        },
        next: {
            id: "song-zebra",
            title: "Zebra",
            author: null,
            number: null
        }
    })
    assert.equal(
        (await send(api, "GET", `${baseUrl}/missing/adjacent`)).status,
        404
    )
    assert.equal(
        (await send(api, "POST", baseUrl, {
            body: { title: "Reader cannot create", parts: [] },
            headers: tokenHeaders(token)
        })).status,
        403
    )

    for (let index = 0; index < 51; index++) {
        api.seed.song(bookId, {
            title: `Page ${String(index).padStart(2, "0")}`
        })
    }
    const pageOne = await send(api, "GET", baseUrl, {
        query: { page: 1 }
    })
    const pageTwo = await send(api, "GET", baseUrl, {
        query: { page: 2 }
    })
    const pageOneBody = await pageOne.json()
    const pageTwoBody = await pageTwo.json()
    assert.equal(pageOneBody.items.length, 50)
    assert.equal(pageOneBody.hasNext, true)
    assert.equal(pageTwoBody.items.length, 5)
})

test("song CRUD preserves omitted chords and replaces them when supplied", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "Chorded"
    })
    const songId = api.seed.song(bookId, {
        id: "song-chorded",
        title: "Chorded song",
        parts: [{
            id: "part-chorded",
            text: "A B",
            chords: [{ offset: 1, symbol: "C" }]
        }]
    })
    api.signIn("owner@example.com")
    const token = await getAntiforgeryToken(api)
    const headers = tokenHeaders(token)
    const songUrl = `/songbooks/${bookId}/songs/${songId}`

    assert.equal((await send(api, "PUT", songUrl, {
        body: {
            title: "Renamed",
            parts: [{ id: "part-chorded", text: "A B" }]
        },
        headers
    })).status, 204)
    let song = await send(api, "GET", songUrl)
    assert.deepEqual((await song.json()).parts[0].chords, [
        { offset: 1, symbol: "C" }
    ])

    assert.equal((await send(api, "PUT", songUrl, {
        body: {
            title: "Not saved",
            parts: [{ id: "part-chorded", text: "ABC" }]
        },
        headers
    })).status, 400)

    assert.equal((await send(api, "PUT", songUrl, {
        body: {
            title: "Cleared",
            parts: [{
                id: "part-chorded",
                text: "ABC",
                chords: []
            }]
        },
        headers
    })).status, 204)
    song = await send(api, "GET", songUrl)
    assert.deepEqual((await song.json()).parts[0].chords, [])

    const created = await send(api, "POST", `/songbooks/${bookId}/songs`, {
        body: {
            title: "New song",
            parts: [{ text: "Lyrics", chords: [] }]
        },
        headers
    })
    assert.equal(created.status, 201)
    const createdSong = await created.json()
    assert.equal(createdSong.parts[0].text, "Lyrics")
    assert.ok(createdSong.parts[0].id)
})

test("fake history lazily baselines existing songs, rejects stale writes and protects restoration", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("reader@example.com")
    const bookId = api.seed.book({ owner: "owner@example.com", name: "History" })
    api.seed.access(bookId, "reader@example.com", "reader")
    const songId = api.seed.song(bookId, { title: "Imported", parts: [{ text: "😀old", chords: [{ offset: 0, symbol: "Am" }] }] })
    api.signIn("owner@example.com")
    const headers = tokenHeaders(await getAntiforgeryToken(api))
    const path = `/songbooks/${bookId}/songs/${songId}`
    assert.equal((await (await send(api, "GET", `${path}/history`)).json()).latestRevision, 0)
    assert.equal((await send(api, "PUT", path, { headers, body: {
        expectedRevision: 0, parts: [{ id: "unknown", text: "bad" }]
    } })).status, 400)
    assert.equal((await (await send(api, "GET", `${path}/history`)).json()).latestRevision, 0)
    assert.equal((await send(api, "PUT", path, { headers, body: { title: "Tracked", parts: [], expectedRevision: 0, actorId: "spoofed" } })).status, 204)
    const baseline = await (await send(api, "GET", `${path}/history/1`)).json()
    assert.equal(baseline.summary.actor, "Unknown (tracking baseline)")
    assert.equal(baseline.snapshot.song.parts[0].text, "😀old")
    assert.equal((await send(api, "DELETE", path, { headers, query: { expectedRevision: "1" } })).status, 409)
    assert.equal((await send(api, "POST", `${path}/history/1/restore`, { body: { expectedRevision: 2 } })).status, 400)
    api.signIn("reader@example.com")
    assert.equal((await send(api, "POST", `${path}/history/1/restore`, { headers, body: { expectedRevision: 2 } })).status, 403)
    api.signIn("owner@example.com")
    assert.equal((await send(api, "POST", `${path}/history/1/restore`, { headers, body: { expectedRevision: 2 } })).status, 200)
    const restored = await (await send(api, "GET", `${path}/history/3`)).json()
    assert.equal(restored.summary.actor, "owner@example.com")
    assert.equal(restored.summary.restoredFromRevision, 1)
    assert.equal(restored.snapshot.song.parts[0].text, baseline.snapshot.song.parts[0].text)
})

test("PDF access, metadata, downloads, and stale state follow server rules", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.seed.account("reader@example.com")
    const bookId = api.seed.book({
        owner: "owner@example.com",
        name: "PDFs"
    })
    api.seed.access(bookId, "reader@example.com", "reader")
    const laterId = api.seed.song(bookId, {
        id: "song-z",
        title: "Zebra"
    })
    const earlierId = api.seed.song(bookId, {
        id: "song-a",
        title: "Amazing Grace"
    })
    const savedPdfId = api.seed.pdf(bookId, {
        includeChords: false,
        songIds: [laterId, earlierId],
        generatedAtUtc: "2000-01-01T00:00:00Z",
        isOutdated: true
    })

    api.signIn("owner@example.com")
    const token = await getAntiforgeryToken(api)
    const pdfUrl = `/songbooks/${bookId}/pdfs`
    const generated = await send(api, "POST", pdfUrl, {
        body: {
            includeChords: true,
            songIds: [laterId, earlierId],
            fontFamily: "dejavu-sans-mono", fontSize: 18, orientation: "landscape", columns: 3
        },
        headers: tokenHeaders(token)
    })
    assert.equal(generated.status, 201)
    const generatedPdf = await generated.json()
    assert.equal(generatedPdf.isWholeBook, false)
    assert.equal(generatedPdf.songCount, 2)
    assert.deepEqual(
        [generatedPdf.fontFamily, generatedPdf.fontSize, generatedPdf.orientation, generatedPdf.columns],
        ["dejavu-sans-mono", 18, "landscape", 3]
    )
    assert.deepEqual(
        generatedPdf.selectedSongs.map(song => song.id),
        [earlierId, laterId]
    )

    const wholeBook = await send(api, "POST", pdfUrl, {
        body: { includeChords: false },
        headers: tokenHeaders(token)
    })
    assert.equal((await wholeBook.json()).isWholeBook, true)
    const newestFirst = await send(api, "GET", pdfUrl)
    const newestFirstItems = (await newestFirst.json()).items
    assert.equal(newestFirstItems.at(-1).id, savedPdfId)
    assert.deepEqual(
        [newestFirstItems.at(-1).fontFamily, newestFirstItems.at(-1).fontSize,
            newestFirstItems.at(-1).orientation, newestFirstItems.at(-1).columns],
        ["lato", 10, "portrait", 1]
    )
    for (const [field, value] of [
        ["fontFamily", "Arial"], ["fontSize", 8.5], ["orientation", "diagonal"], ["columns", 3]
    ]) {
        const rejected = await send(api, "POST", pdfUrl, {
            body: { includeChords: true, [field]: value },
            headers: tokenHeaders(token)
        })
        assert.equal(rejected.status, 400)
        assert.ok((await rejected.json()).errors[field])
    }
    assert.equal((await (await send(api, "GET", pdfUrl)).json()).items.length, 3)
    const activity = await (await send(api, "GET", `/songbooks/${bookId}/history`)).json()
    assert.equal(activity.items.filter(item => item.operation === "pdf.generated").length, 2)
    assert.equal(generatedPdf.isOutdated, false)
    assert.equal(
        (await send(api, "POST", pdfUrl, {
            body: { includeChords: true, songIds: [] },
            headers: tokenHeaders(token)
        })).status,
        400
    )

    api.signIn("reader@example.com")
    const deniedGeneration = await send(api, "POST", pdfUrl, {
        body: { includeChords: true },
        headers: tokenHeaders(token)
    })
    assert.equal(deniedGeneration.status, 403)
    const download = await send(
        api,
        "GET",
        `${pdfUrl}/${savedPdfId}/download`
    )
    assert.equal(download.headers.get("content-type"), "application/pdf")
    assert.match(await download.text(), /^%PDF-1\.7/)

    api.signIn("owner@example.com")
    await send(api, "PUT", `/songbooks/${bookId}/songs/${earlierId}`, {
        body: { title: "Updated", parts: [] },
        headers: tokenHeaders(token)
    })
    const pdfs = await send(api, "GET", pdfUrl)
    const pdfList = await pdfs.json()
    assert.equal(
        pdfList.items.every(pdf => pdf.isOutdated),
        true
    )
})

test("moderation endpoints enforce moderator and superuser permissions", async () => {
    const api = createFakeApi()
    const moderatorId = api.seed.account("moderator@example.com", {
        role: "moderator"
    })
    const superuserId = api.seed.account("superuser@example.com", {
        role: "superuser"
    })
    const ordinaryId = api.seed.account("ordinary@example.com")
    const confirmedId = api.seed.account("confirmed@example.com")
    const deleteTargetId = api.seed.account("delete-target@example.com")
    const otherModeratorId = api.seed.account("other-moderator@example.com", {
        role: "moderator"
    })
    const otherSuperuserId = api.seed.account("other-superuser@example.com", {
        role: "superuser"
    })
    const unconfirmedId = api.seed.account("unconfirmed@example.com", {
        confirmed: false
    })
    api.seed.book({
        owner: "delete-target@example.com",
        name: "Owned by delete target"
    })

    api.signIn("moderator@example.com")
    const token = await getAntiforgeryToken(api)
    const usersUrl = "/admin/users"
    const users = await send(api, "GET", usersUrl)
    const usersBody = await users.json()
    assert.equal(usersBody.items.some(user => user.id === moderatorId), false)
    assert.equal(
        (await send(api, "PUT", `${usersUrl}/${ordinaryId}/role`, {
            body: { role: "moderator" },
            headers: tokenHeaders(token)
        })).status,
        403
    )
    assert.equal(
        (await send(api, "PUT", `${usersUrl}/${ordinaryId}/ban`, {
            body: { isBanned: true },
            headers: tokenHeaders(token)
        })).status,
        204
    )
    assert.equal(
        (await send(api, "PUT", `${usersUrl}/${otherModeratorId}/ban`, {
            body: { isBanned: true },
            headers: tokenHeaders(token)
        })).status,
        403
    )
    assert.equal(
        (await send(api, "DELETE", `${usersUrl}/${deleteTargetId}`, {
            headers: tokenHeaders(token)
        })).status,
        204
    )

    api.signIn("superuser@example.com")
    assert.equal(
        (await send(api, "PUT", `${usersUrl}/${confirmedId}/role`, {
            body: { role: "moderator" },
            headers: tokenHeaders(token)
        })).status,
        204
    )
    assert.equal(
        (await send(api, "PUT", `${usersUrl}/${unconfirmedId}/role`, {
            body: { role: "moderator" },
            headers: tokenHeaders(token)
        })).status,
        400
    )
    assert.equal(
        (await send(api, "PUT", `${usersUrl}/${otherModeratorId}/ban`, {
            body: { isBanned: true },
            headers: tokenHeaders(token)
        })).status,
        204
    )
    assert.equal(
        (await send(api, "DELETE", `${usersUrl}/${superuserId}`, {
            headers: tokenHeaders(token)
        })).status,
        403
    )
    assert.equal(
        (await send(api, "DELETE", `${usersUrl}/${otherSuperuserId}`, {
            headers: tokenHeaders(token)
        })).status,
        403
    )
    assert.equal(
        (await send(api, "PUT", `${usersUrl}/${ordinaryId}/role`, {
            body: { role: "moderator" },
            headers: tokenHeaders(token)
        })).status,
        400
    )
})

test("interceptors can asynchronously override individual API responses", async () => {
    const api = createFakeApi()
    api.seed.account("owner@example.com")
    api.signIn("owner@example.com")
    let intercepted = false
    api.intercept(async request => {
        if (request.path !== "/songbooks") {
            return undefined
        }
        await Promise.resolve()
        intercepted = true
        return {
            status: 503,
            body: { title: "Temporarily unavailable" }
        }
    })

    const response = await send(api, "GET", "/songbooks")
    assert.equal(intercepted, true)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), {
        title: "Temporarily unavailable"
    })
    assert.deepEqual(api.requests[0], {
        method: "GET",
        path: "/songbooks",
        query: {},
        body: null,
        headers: {}
    })
})

async function send(api, method, path, { query = {}, body = null, headers = {} } = {}) {
    return api.handle({ method, path, query, body, headers })
}

async function getAntiforgeryToken(api) {
    const response = await send(api, "GET", "/auth/antiforgery")
    return (await response.json()).token
}

function tokenHeaders(token) {
    return { "X-CSRF-TOKEN": token }
}
