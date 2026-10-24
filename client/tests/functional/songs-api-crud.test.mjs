import assert from "node:assert/strict"
import test from "node:test"

import {
    createSong,
    deleteSong,
    getSong,
    getSongs,
    updateSong
} from "../../src/songsApi.js"
import {
    ApiError,
    resetAntiforgeryToken
} from "../../src/httpClient.js"
import { createFakeApi } from "../helpers/fakeApi.mjs"
import { installAppBrowser } from "../helpers/testBrowser.mjs"

test("songs API adapter completes the five-endpoint CRUD workflow", async () => {
    const api = createFakeApi()
    api.seed.account("editor@example.com")
    const songBookId = api.seed.book({
        owner: "editor@example.com",
        name: "Adapter songs"
    })
    api.signIn("editor@example.com")
    const browser = installAppBrowser({ api })

    const createPayload = {
        title: "Adapter song",
        author: "Adapter author",
        originalTitle: null,
        number: "1",
        key: null,
        tempo: null,
        parts: []
    }

    try {
        resetAntiforgeryToken()
        const createdSong = await createSong(songBookId, createPayload)
        assert.equal(createdSong.id, "song-1")
        assert.deepEqual(await getSongs(songBookId), {
            items: [createdSong].map(({ id, title, author, number }) => ({
                id,
                title,
                author,
                number
            })),
            page: 1,
            hasNext: false
        })
        assert.deepEqual(
            await getSong(songBookId, createdSong.id),
            createdSong
        )

        const updatePayload = {
            ...createPayload,
            title: "Adapter song updated",
            key: "A"
        }
        assert.equal(
            await updateSong(songBookId, createdSong.id, updatePayload),
            undefined
        )
        assert.deepEqual(await getSong(songBookId, createdSong.id), {
            id: createdSong.id,
            ...updatePayload
        })

        assert.equal(
            await deleteSong(songBookId, createdSong.id),
            undefined
        )
        assert.deepEqual(await getSongs(songBookId), {
            items: [],
            page: 1,
            hasNext: false
        })

        await assert.rejects(
            getSong(songBookId, createdSong.id),
            error => {
                assert.equal(error instanceof ApiError, true)
                assert.equal(error.status, 404)
                return true
            }
        )
    } finally {
        browser.restore()
        resetAntiforgeryToken()
    }
})
