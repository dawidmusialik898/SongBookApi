import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../../src/httpClient.js"
import {
    getAuthValidationMessage,
    getDeleteSongBookErrorMessage,
    getLoadSongBooksErrorMessage,
    getSafeApiDetail,
    getSaveSongBookErrorMessage,
    toSentence
} from "../../src/ui/errors.js"

test("safe API details are normalized and unsafe details are excluded", () => {
    assert.equal(
        getSafeApiDetail(new ApiError("bad", {
            status: 400,
            details: { detail: "  Choose   another name " }
        })),
        "Choose another name"
    )
    assert.equal(
        getSafeApiDetail(new ApiError("bad", {
            status: 400,
            details: "<script>alert(1)</script>"
        })),
        null
    )
    assert.equal(
        getSafeApiDetail(new ApiError("bad", {
            status: 400,
            details: "An exception occurred."
        })),
        null
    )
    assert.equal(
        getSafeApiDetail(new ApiError("bad", {
            status: 400,
            details: "x".repeat(241)
        })),
        null
    )
    assert.equal(toSentence("Already complete."), "Already complete.")
    assert.equal(toSentence("Choose another name"), "Choose another name.")
})

test("authentication validation includes only safe 400 details", () => {
    const fallback = "Registration could not be completed."
    assert.equal(
        getAuthValidationMessage(new ApiError("bad", {
            status: 400,
            details: { detail: "The email is invalid" }
        }), fallback),
        "Registration could not be completed. The email is invalid."
    )
    assert.equal(
        getAuthValidationMessage(new ApiError("bad", {
            status: 400,
            details: { detail: "<unsafe>" }
        }), fallback),
        fallback
    )
    assert.equal(
        getAuthValidationMessage(new ApiError("bad", { status: 500 }), fallback),
        fallback
    )
})

test("song-book load errors distinguish network, server, and other failures", () => {
    assert.equal(
        getLoadSongBooksErrorMessage(new ApiError("offline", {
            status: null
        })),
        "Could not reach the SongBook API. Your song books could not be refreshed."
    )
    assert.equal(
        getLoadSongBooksErrorMessage(new ApiError("server", {
            status: 503
        }), true),
        "The server could not load song books. Try again. The displayed list may be out of date."
    )
    for (const status of [400, 401, 403, 404]) {
        assert.equal(
            getLoadSongBooksErrorMessage(new ApiError("request failed", {
                status
            })),
            "Could not load song books. Try again."
        )
    }
})

test("song-book mutations include safe details and keep conflict wording", () => {
    assert.equal(
        getSaveSongBookErrorMessage(new ApiError("duplicate", {
            status: 409
        }), "create"),
        "You already have a song book with that name. Choose a different name."
    )
    assert.equal(
        getSaveSongBookErrorMessage(new ApiError("invalid", {
            status: 400,
            details: { detail: "The name is too long" }
        }), "rename"),
        "The song book could not be renamed. The name is too long."
    )
    assert.equal(
        getSaveSongBookErrorMessage(new ApiError("invalid", {
            status: 400,
            details: { detail: "exception: private data" }
        }), "create"),
        "The song book could not be created. Check the name."
    )
    assert.equal(
        getSaveSongBookErrorMessage(new ApiError("offline", {
            status: null
        }), "create"),
        "Could not reach the SongBook API. The entered name was kept."
    )
    for (const status of [403, 404, 500]) {
        assert.equal(
            getSaveSongBookErrorMessage(new ApiError("failed", {
                status
            }), "create"),
            "Could not create the song book. The entered name was kept."
        )
    }
})

test("song-book deletion errors distinguish network failure", () => {
    assert.equal(
        getDeleteSongBookErrorMessage(new ApiError("offline", {
            status: null
        })),
        "Could not reach the SongBook API. The song book was not deleted."
    )
    for (const status of [400, 403, 404, 409, 500]) {
        assert.equal(
            getDeleteSongBookErrorMessage(new ApiError("failed", {
                status
            })),
            "Could not delete the song book. Try again."
        )
    }
})
