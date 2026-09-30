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
import { createFetchResponse } from "../helpers/testBrowser.mjs"

test("songs API adapter completes the five-endpoint CRUD workflow", async () => {
    const songs = new Map()
    const songBookId = "book / one"
    let nextId = 1
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url, options = {}) => {
        const method = options.method ?? "GET"
        const parsedUrl = new URL(url, "https://localhost/")

        if (parsedUrl.pathname === "/auth/antiforgery") {
            return createFetchResponse({
                body: { token: "functional-csrf-token" }
            })
        }

        const segments = parsedUrl.pathname
            .split("/")
            .filter(Boolean)
            .map(decodeURIComponent)
        assert.deepEqual(segments.slice(0, 3), [
            "songbooks",
            songBookId,
            "songs"
        ])
        const idSegment = segments[3]
        const id = idSegment === undefined
            ? null
            : decodeURIComponent(idSegment)

        if (id === null && method === "GET") {
            return createFetchResponse({
                body: [...songs.values()]
            })
        }

        if (id === null && method === "POST") {
            const createdSong = {
                id: `song-${nextId}`,
                ...JSON.parse(options.body)
            }
            nextId += 1
            songs.set(createdSong.id, createdSong)
            return createFetchResponse({
                body: createdSong,
                status: 201
            })
        }

        if (id !== null && method === "GET") {
            if (!songs.has(id)) {
                return createFetchResponse({
                    body: {
                        message: "Song not found"
                    },
                    status: 404
                })
            }

            return createFetchResponse({
                body: songs.get(id)
            })
        }

        if (id !== null && method === "PUT") {
            if (!songs.has(id)) {
                return createFetchResponse({
                    body: {
                        message: "Song not found"
                    },
                    status: 404
                })
            }

            songs.set(id, {
                id,
                ...JSON.parse(options.body)
            })
            return createFetchResponse({
                body: null,
                status: 204
            })
        }

        if (id !== null && method === "DELETE") {
            if (!songs.delete(id)) {
                return createFetchResponse({
                    body: {
                        message: "Song not found"
                    },
                    status: 404
                })
            }

            return createFetchResponse({
                body: null,
                status: 204
            })
        }

        return createFetchResponse({
            body: {
                message: "Method not allowed"
            },
            status: 405
        })
    }

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
        assert.deepEqual(await getSongs(songBookId), [createdSong])
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
        assert.deepEqual(await getSongs(songBookId), [])

        await assert.rejects(
            getSong(songBookId, createdSong.id),
            error => {
                assert.equal(error instanceof ApiError, true)
                assert.equal(error.status, 404)
                return true
            }
        )
    } finally {
        globalThis.fetch = originalFetch
    }
})
