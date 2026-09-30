import { request } from "./httpClient.js"

function requireId(value, label) {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    ) {
        throw new TypeError(`${label} must not be blank.`)
    }

    return encodeURIComponent(value)
}

function getSongsUrl(songBookId) {
    return `/songbooks/${requireId(songBookId, "Song book id")}/songs`
}

function getSongUrl(songBookId, songId) {
    return `${getSongsUrl(songBookId)}/${requireId(songId, "Song id")}`
}

export function getSongs(songBookId) {
    return request(getSongsUrl(songBookId))
}

export function getSong(songBookId, songId) {
    return request(getSongUrl(songBookId, songId))
}

export function createSong(songBookId, songPayload) {
    return request(getSongsUrl(songBookId), {
        method: "POST",
        json: songPayload
    })
}

export function updateSong(songBookId, songId, songPayload) {
    return request(getSongUrl(songBookId, songId), {
        method: "PUT",
        json: songPayload
    })
}

export function deleteSong(songBookId, songId) {
    return request(getSongUrl(songBookId, songId), {
        method: "DELETE"
    })
}
