import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../../src/httpClient.js"
import {
    getAuthValidationMessage,
    getDownloadPdfErrorMessage,
    getDeleteSongErrorMessage,
    getDeleteSongBookErrorMessage,
    getGeneratePdfErrorMessage,
    getLoadCollaboratorsErrorMessage,
    getLoadPdfsErrorMessage,
    getLoadSongBookErrorMessage,
    getLoadSongErrorMessage,
    getLoadSongBooksErrorMessage,
    getLoadSongsErrorMessage,
    getLoadUsersErrorMessage,
    getManagedUserActionErrorMessage,
    getSafeApiDetail,
    getSaveSongErrorMessage,
    getSongBookAccessErrorMessage,
    getSaveSongBookErrorMessage,
    isUnavailableBookError,
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
        "Could not reach the SongBook API. Your song books could not be loaded. Try again."
    )
    assert.equal(
        getLoadSongBooksErrorMessage(new ApiError("server", {
            status: 503
        })),
        "The server could not load song books. Try again."
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

test("book, song, and song-list load messages keep the ported wording", () => {
    assert.equal(
        getLoadSongBookErrorMessage(new ApiError("offline", {
            status: null
        })),
        "Could not reach the SongBook API. Open the song book again to retry."
    )
    assert.equal(
        getLoadSongBookErrorMessage(new ApiError("server", {
            status: 503
        })),
        "The server could not load the selected song book. Try again."
    )
    assert.equal(
        getLoadSongsErrorMessage(new ApiError("offline", {
            status: null
        })),
        "Could not reach the SongBook API. Check that it is running, then try again."
    )
    assert.equal(
        getLoadSongsErrorMessage(new ApiError("bad request", {
            status: 400
        })),
        "The API rejected the request to load songs. Try again."
    )
    assert.equal(
        getLoadSongErrorMessage(new ApiError("server", {
            status: 503
        })),
        "The server could not load song details. Select the song again to retry."
    )
    assert.equal(
        getLoadSongErrorMessage(new ApiError("offline", {
            status: null
        })),
        "Could not reach the SongBook API. Select the song again to retry."
    )
})

test("PDF load, generation, and download errors use actionable messages", () => {
    assert.equal(
        getLoadPdfsErrorMessage(new ApiError("offline", { status: null })),
        "Could not reach the SongBook API. " +
            "PDF exports could not be loaded. Try again."
    )
    assert.equal(
        getLoadPdfsErrorMessage(new ApiError("server", { status: 503 })),
        "The server could not load PDF exports. Try again."
    )
    assert.equal(
        getLoadPdfsErrorMessage(new ApiError("bad request", { status: 400 })),
        "Could not load PDF exports. Try again."
    )
    assert.equal(
        getGeneratePdfErrorMessage(new ApiError("invalid", {
            status: 400,
            details: { detail: "Choose a song" }
        })),
        "The PDF request was rejected. Choose a song."
    )
    assert.equal(
        getGeneratePdfErrorMessage(new ApiError("invalid", {
            status: 400,
            details: "<script>"
        })),
        "The PDF request was rejected. Check the selected songs."
    )
    assert.equal(
        getGeneratePdfErrorMessage(new ApiError("offline", { status: null })),
        "Could not generate the PDF. It may have been created; try again."
    )
    assert.equal(
        getGeneratePdfErrorMessage(new ApiError("server", { status: 503 })),
        "Could not generate the PDF. Try again."
    )
    assert.equal(
        getDownloadPdfErrorMessage(new ApiError("offline", { status: null })),
        "Could not reach the SongBook API. " +
            "Try downloading the PDF again."
    )
    assert.equal(
        getDownloadPdfErrorMessage(new ApiError("missing", { status: 404 })),
        "Could not download the PDF. Try again."
    )
})

test("collaborator load and mutation errors are actionable and filter unsafe details", () => {
    assert.equal(
        getLoadCollaboratorsErrorMessage(
            new ApiError("offline", { status: null })
        ),
        "Could not reach the SongBook API. " +
            "Collaborators could not be loaded. Try again."
    )
    assert.equal(
        getLoadCollaboratorsErrorMessage(
            new ApiError("server", { status: 503 })
        ),
        "The server could not load collaborators. Try again."
    )
    assert.equal(
        getLoadCollaboratorsErrorMessage(
            new ApiError("bad request", { status: 400 })
        ),
        "Could not load collaborators. Try again."
    )
    assert.equal(
        getSongBookAccessErrorMessage(new ApiError("invalid", {
            status: 400,
            details: { detail: "The user must be registered" }
        })),
        "The collaborator access request was rejected. " +
            "The user must be registered."
    )
    assert.equal(
        getSongBookAccessErrorMessage(new ApiError("invalid", {
            status: 400,
            details: "<private>"
        })),
        "The collaborator access request was rejected."
    )
    assert.equal(
        getSongBookAccessErrorMessage(
            new ApiError("offline", { status: null })
        ),
        "Could not reach the SongBook API. " +
            "The collaborator change was not saved."
    )
    assert.equal(
        getSongBookAccessErrorMessage(
            new ApiError("forbidden", { status: 403 })
        ),
        "Could not update collaborator access. Try again."
    )
})

test("song deletion failures use the original actionable messages", () => {
    assert.equal(
        getDeleteSongErrorMessage(new ApiError("offline", {
            status: null
        })),
        "Could not reach the SongBook API. The song was not deleted. Try again."
    )
    assert.equal(
        getDeleteSongErrorMessage(new ApiError("bad request", {
            status: 400
        })),
        "The API rejected the delete request. The song was not deleted. Try again."
    )
    assert.equal(
        getDeleteSongErrorMessage(new ApiError("server", {
            status: 503
        })),
        "The server could not delete the song. The song remains available. Try again."
    )
})

test("song save failures include only safe details and preserve draft guidance", () => {
    assert.equal(
        getSaveSongErrorMessage(new ApiError("invalid", {
            status: 400,
            details: { detail: "The title is invalid" }
        }), "create"),
        "The API rejected the submitted song. The title is invalid. " +
            "Review the entered values and try again. " +
            "Your new song draft was kept."
    )
    assert.equal(
        getSaveSongErrorMessage(new ApiError("invalid", {
            status: 400,
            details: { detail: "<unsafe>" }
        }), "edit"),
        "The API rejected the submitted song. Review the entered values " +
            "and try again. Your changes were kept."
    )
    assert.equal(
        getSaveSongErrorMessage(new ApiError("offline", {
            status: null
        }), "edit"),
        "Could not reach the SongBook API. Your changes were kept. Try again."
    )
    assert.equal(
        getSaveSongErrorMessage(new ApiError("server", {
            status: 503
        }), "create"),
        "The server could not create the song. " +
            "Your new song draft was kept. Try again."
    )
    assert.equal(
        getSaveSongErrorMessage(new ApiError("failed", {
            status: 403
        }), "edit"),
        "Could not save the changes. Your changes were kept. Try again."
    )
})

test("book-unavailable classification covers access and missing-book responses", () => {
    for (const status of [403, 404]) {
        assert.equal(
            isUnavailableBookError(new ApiError("unavailable", { status })),
            true
        )
    }
    assert.equal(
        isUnavailableBookError(new ApiError("failed", { status: 500 })),
        false
    )
    assert.equal(isUnavailableBookError(new Error("failed")), false)
})

test("user-management load and mutation errors are actionable", () => {
    assert.equal(
        getLoadUsersErrorMessage(new ApiError("offline", {
            status: null
        })),
        "Could not reach the SongBook API. " +
            "User accounts could not be loaded. Try again."
    )
    assert.equal(
        getLoadUsersErrorMessage(new ApiError("server", {
            status: 503
        })),
        "The server could not load users. Try again."
    )
    assert.equal(
        getLoadUsersErrorMessage(new ApiError("forbidden", {
            status: 403
        })),
        "Could not load users. Try again."
    )
    assert.equal(
        getManagedUserActionErrorMessage(new ApiError("invalid", {
            status: 400,
            details: { detail: "The account is already banned" }
        })),
        "The account could not be updated. The account is already banned."
    )
    assert.equal(
        getManagedUserActionErrorMessage(new ApiError("invalid", {
            status: 400,
            details: "<unsafe>"
        })),
        "The account could not be updated. Try again."
    )
    assert.equal(
        getManagedUserActionErrorMessage(new ApiError("offline", {
            status: null
        })),
        "Could not reach the SongBook API. " +
            "The account may have been updated. Try again."
    )
    assert.equal(
        getManagedUserActionErrorMessage(new ApiError("server", {
            status: 503
        })),
        "The account could not be updated. Try again."
    )
})
