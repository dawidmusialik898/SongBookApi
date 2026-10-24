import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("song pages stay bounded, retain details, and recover after deletion", async () => {
    const songs = Array.from({ length: 51 }, (_, index) => ({
        id: `song-${index}`,
        title: `Song ${index}`,
        parts: []
    }))
    const browser = installTestBrowser(request => {
        if (request.url === "/songs" && request.method === "GET") {
            return { body: songs }
        }

        const song = songs.find(candidate =>
            request.url === `/songs/${candidate.id}`
        )
        if (song !== undefined && request.method === "GET") {
            return { body: song }
        }
        if (song !== undefined && request.method === "DELETE") {
            songs.splice(songs.indexOf(song), 1)
            return { body: null, status: 204 }
        }

        throw new Error(`Unexpected song request: ${request.method} ${request.url}`)
    })
    const app = await import("../../src/main.js?paging-songs")
    await app.initialization

    assert.equal(app.state.songs.length, 50)
    assert.equal(app.state.songHasNext, true)
    assert.equal(browser.getElement("song-page-status").textContent, "Page 1")
    assert.equal(browser.getElement("previous-song-page-button").disabled, true)
    await browser.getButton("Next songs").click()

    assert.equal(app.state.songPage, 2)
    assert.equal(app.state.songs.length, 1)
    assert.equal(browser.getElement("next-song-page-button").disabled, true)
    assert.equal(browser.requests.at(-1).url, "/songbooks/default-book/songs?page=2")
    await browser.getButton("View").click()
    assert.equal(app.state.selectedSongId, "song-50")

    await browser.getButton("Previous songs").click()
    assert.equal(app.state.selectedSongId, "song-50")
    assert.match(browser.getElement("song-details").textContent, /Song 50/)
    await browser.getButton("Next songs").click()
    assert.equal(
        browser.getButton("View").getAttribute("aria-current"),
        "true"
    )

    await browser.getButtons("Delete")[0].click()
    assert.equal(app.state.selectedSongId, null)
    assert.equal(app.state.songPage, 1)
    assert.equal(app.state.songs.length, 50)
    assert.equal(app.state.songHasNext, false)
    assert.equal(browser.getElement("song-pagination").hidden, true)
})

test("song-book and collaborator pages keep their independent selection state", async () => {
    const books = Array.from({ length: 51 }, (_, index) => ({
        id: `book-${index}`,
        name: `Book ${index}`,
        accessLevel: "admin",
        songCount: 0
    }))
    const members = Array.from({ length: 51 }, (_, index) => ({
        id: `member-${index}`,
        email: `member-${index}@example.test`,
        accessLevel: "reader"
    }))
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            songBookHandler: request => {
                const segments = new URL(
                    request.url,
                    "https://localhost/"
                ).pathname.split("/").filter(Boolean)
                if (segments.length === 1 && request.method === "GET") {
                    return { body: books }
                }
                if (segments.at(-1) === "access" &&
                    request.method === "GET") {
                    return { body: members }
                }
                if (segments.length === 2 && request.method === "GET") {
                    return {
                        body: books.find(book => book.id === segments[1])
                    }
                }
                if (segments.at(-2) === "access" &&
                    request.method === "DELETE") {
                    const index = members.findIndex(member =>
                        member.id === segments.at(-1)
                    )
                    members.splice(index, 1)
                    return { body: null, status: 204 }
                }

                throw new Error(`Unexpected book request: ${request.method} ${request.url}`)
            }
        }
    )
    const app = await import("../../src/main.js?paging-books")
    await app.initialization

    assert.equal(app.state.songBooks.length, 50)
    assert.equal(app.state.selectedSongBookId, null)
    await browser.getElement("song-book-list").children[0].children[0].click()
    assert.equal(app.state.selectedSongBookId, "book-0")
    assert.equal(app.state.songBookMembers.length, 50)
    const memberRequests = browser.songBookRequests.filter(request =>
        request.url.endsWith("/access") && request.method === "GET"
    ).length

    await browser.getButton("Next song books").click()
    assert.equal(app.state.songBookPage, 2)
    assert.equal(app.state.selectedSongBookId, "book-0")
    assert.equal(app.state.songBooks[0].id, "book-50")
    assert.equal(
        browser.songBookRequests.filter(request =>
            request.url.endsWith("/access") && request.method === "GET"
        ).length,
        memberRequests
    )
    await browser.getButton("Next collaborators").click()
    assert.equal(app.state.memberPage, 2)
    assert.equal(app.state.songBookMembers[0].id, "member-50")
    await browser.getButton("Remove").click()
    assert.equal(app.state.memberPage, 1)
    assert.equal(app.state.songBookMembers.length, 50)
    assert.equal(browser.getElement("member-pagination").hidden, true)

    await browser.getElement("song-book-list").children[0].children[0].click()
    assert.equal(app.state.selectedSongBookId, "book-50")
    assert.equal(app.state.memberPage, 1)
    assert.equal(app.state.songPage, 1)
})

test("moderation pages return to the preceding page after removing its last user", async () => {
    const users = Array.from({ length: 51 }, (_, index) => ({
        id: `user-${index}`,
        email: `user-${index}@example.test`,
        role: "user",
        isBanned: false,
        emailConfirmed: true
    }))
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: true,
                            email: "owner@example.test",
                            role: "superuser"
                        }
                    }
                }
                throw new Error(`Unexpected auth request: ${request.url}`)
            },
            moderationHandler: request => {
                if (request.method === "GET") {
                    return { body: users }
                }
                if (request.method === "DELETE") {
                    const id = request.url.split("/").at(-1)
                    const index = users.findIndex(user => user.id === id)
                    users.splice(index, 1)
                    return { body: null, status: 204 }
                }
                throw new Error(`Unexpected moderation request: ${request.url}`)
            }
        }
    )
    const app = await import("../../src/main.js?paging-users")
    await app.initialization
    await browser.getButton("Manage users").click()
    assert.equal(app.state.managedUsers.length, 50)
    await browser.getButton("Next users").click()
    assert.equal(app.state.managedUserPage, 2)
    assert.equal(app.state.managedUsers[0].id, "user-50")

    await browser.getButton("Delete user").click()
    assert.equal(app.state.managedUserPage, 1)
    assert.equal(app.state.managedUsers.length, 50)
    assert.equal(browser.getElement("user-pagination").hidden, true)
})

test("a same-account draft in a later book page survives reauthentication", async () => {
    let authenticated = true
    const books = Array.from({ length: 51 }, (_, index) => ({
        id: `book-${index}`,
        name: `Book ${index}`,
        accessLevel: "admin",
        songCount: 0
    }))
    const browser = installTestBrowser(
        request => {
            if (request.method === "GET") {
                return { body: [] }
            }
            authenticated = false
            return { body: { title: "Unauthorized" }, status: 401 }
        },
        {
            authHandler: request => {
                if (request.url === "/auth/me") {
                    return {
                        body: {
                            isAuthenticated: authenticated,
                            email: authenticated
                                ? "owner@example.test"
                                : null
                        }
                    }
                }
                if (request.url === "/auth/login") {
                    authenticated = true
                    return { body: null, status: 204 }
                }
                throw new Error(`Unexpected auth request: ${request.url}`)
            },
            songBookHandler: request => {
                const segments = new URL(
                    request.url,
                    "https://localhost/"
                ).pathname.split("/").filter(Boolean)
                if (segments.length === 1) {
                    return { body: books }
                }
                if (segments.at(-1) === "access") {
                    return { body: [] }
                }
                if (segments.length === 2) {
                    return {
                        body: books.find(book => book.id === segments[1])
                    }
                }
                throw new Error(`Unexpected book request: ${request.url}`)
            }
        }
    )
    const app = await import("../../src/main.js?paging-draft")
    await app.initialization
    await browser.getButton("Next song books").click()
    await browser.getElement("song-book-list").children[0].children[0].click()
    await browser.getButton("New song").click()
    browser.getElement("song-title").value = "Off-page draft"
    await browser.getElement("song-form").submit()

    browser.getElement("login-email").value = "owner@example.test"
    browser.getElement("login-password").value = "same account"
    await browser.getElement("login-form").submit()

    assert.equal(app.state.songBookPage, 1)
    assert.equal(app.state.selectedSongBookId, "book-50")
    assert.equal(app.state.editorMode, "create")
    assert.equal(browser.getElement("song-title").value, "Off-page draft")
})

test("a revoked book selected on another page clears its cached private data", async () => {
    const books = Array.from({ length: 51 }, (_, index) => ({
        id: `book-${index}`,
        name: `Book ${index}`,
        accessLevel: "admin",
        songCount: 1
    }))
    const browser = installTestBrowser(
        () => ({ body: [{ id: "private-song", title: "Private song" }] }),
        {
            songBookHandler: request => {
                const segments = new URL(
                    request.url,
                    "https://localhost/"
                ).pathname.split("/").filter(Boolean)
                if (segments.length === 1) {
                    return { body: books }
                }
                if (segments.at(-1) === "access") {
                    return { body: [] }
                }
                const book = books.find(candidate =>
                    candidate.id === segments[1]
                )
                return book === undefined
                    ? { body: { title: "Not found" }, status: 404 }
                    : { body: book }
            }
        }
    )
    const app = await import("../../src/main.js?paging-revocation")
    await app.initialization
    await browser.getElement("song-book-list").children[0].children[0].click()
    await browser.getButton("Next song books").click()
    assert.equal(app.state.selectedSongBookId, "book-0")
    assert.equal(app.state.songs.length, 1)

    books.shift()
    await browser.getButton("Previous song books").click()

    assert.equal(app.state.selectedSongBookId, null)
    assert.deepEqual(app.state.songs, [])
    assert.equal(
        browser.getElement("app-status").textContent,
        "That song book is no longer available to your account."
    )
})

test("a song shifted to the next page remains selected after refresh", async () => {
    const songs = Array.from({ length: 50 }, (_, index) => ({
        id: `song-${index}`,
        title: `Song ${index}`
    }))
    const browser = installTestBrowser(request => {
        if (request.url === "/songs") {
            return { body: songs }
        }
        const song = songs.find(candidate =>
            request.url === `/songs/${candidate.id}`
        )
        return song === undefined
            ? { body: { title: "Not found" }, status: 404 }
            : { body: { ...song, parts: [] } }
    })
    const app = await import("../../src/main.js?paging-song-shift")
    await app.initialization
    await browser.getButtons("View").at(-1).click()
    assert.equal(app.state.selectedSongId, "song-49")

    songs.unshift({ id: "song-new", title: "New first song" })
    await browser.getButton("Refresh songs").click()
    assert.equal(app.state.selectedSongId, "song-49")
    assert.equal(app.state.selectedSong.title, "Song 49")
    assert.equal(app.state.songs.length, 50)
    assert.equal(app.state.songHasNext, true)

    await browser.getButton("Next songs").click()
    assert.equal(app.state.songs[0].id, "song-49")
    assert.equal(
        browser.getButton("View").getAttribute("aria-current"),
        "true"
    )
})

test("a book shifted to a different page stays selected after refresh", async () => {
    const books = Array.from({ length: 50 }, (_, index) => ({
        id: `book-${index}`,
        name: `Book ${index}`,
        accessLevel: "admin",
        songCount: 0
    }))
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            songBookHandler: request => {
                const segments = new URL(
                    request.url,
                    "https://localhost/"
                ).pathname.split("/").filter(Boolean)
                if (segments.length === 1) {
                    return { body: books }
                }
                if (segments.at(-1) === "access") {
                    return { body: [] }
                }
                const book = books.find(candidate =>
                    candidate.id === segments[1]
                )
                return book === undefined
                    ? { body: { title: "Not found" }, status: 404 }
                    : { body: book }
            }
        }
    )
    const app = await import("../../src/main.js?paging-book-shift")
    await app.initialization
    await browser.getElement("song-book-list").children.at(-1)
        .children[0].click()
    assert.equal(app.state.selectedSongBookId, "book-49")

    books.unshift({
        id: "book-new",
        name: "A new book",
        accessLevel: "admin",
        songCount: 0
    })
    await browser.getButton("Refresh song books").click()
    assert.equal(app.state.selectedSongBookId, "book-49")
    assert.equal(app.state.songBooks.length, 50)

    await browser.getButton("Next song books").click()
    assert.equal(app.state.songBooks[0].id, "book-49")
    assert.equal(
        browser.getElement("song-book-list").children[0]
            .children[0].getAttribute("aria-current"),
        "true"
    )
})
