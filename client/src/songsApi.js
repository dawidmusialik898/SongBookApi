import { request } from "./httpClient.js"
import { pageUrl } from "./pagination.js"

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

export function getSongs(
    songBookId,
    page = 1,
    { search, signal } = {}
) {
    const trimmedSearch = typeof search === "string"
        ? search.trim()
        : ""
    const params = trimmedSearch === ""
        ? {}
        : { search: trimmedSearch }

    return request(
        pageUrl(getSongsUrl(songBookId), page, params),
        { signal }
    )
}

export function getSong(songBookId, songId, { signal } = {}) {
    return request(getSongUrl(songBookId, songId), { signal })
}

export function getAdjacentSongs(songBookId, songId, { signal } = {}) {
    return request(
        `${getSongUrl(songBookId, songId)}/adjacent`,
        { signal }
    )
}

export function createSong(songBookId, songPayload) {
    return request(getSongsUrl(songBookId), {
        method: "POST",
        json: songPayload
    })
}

export function copySong(destinationBookId, sourceBookId, sourceSongId, { signal } = {}) {
    requireId(sourceBookId, "Source song book id")
    requireId(sourceSongId, "Source song id")
    return request(`${getSongsUrl(destinationBookId)}/copy`, {
        method: "POST",
        json: { sourceBookId, sourceSongId },
        signal
    })
}

export function updateSong(songBookId, songId, songPayload) {
    return request(getSongUrl(songBookId, songId), {
        method: "PUT",
        json: songPayload
    })
}

export function deleteSong(songBookId, songId, expectedRevision) {
    const query = expectedRevision === undefined
        ? "" : `?expectedRevision=${encodeURIComponent(expectedRevision)}`
    return request(`${getSongUrl(songBookId, songId)}${query}`, {
        method: "DELETE"
    })
}

export function getBookHistory(bookId, page = 1, { signal } = {}) {
    return request(pageUrl(`/songbooks/${requireId(bookId, "Song book id")}/history`, page), { signal })
}

export function getSongHistory(bookId, songId, page = 1, { signal } = {}) {
    return request(pageUrl(`${getSongUrl(bookId, songId)}/history`, page), { signal })
}

export function getSongSnapshot(bookId, songId, revision, { signal } = {}) {
    return request(`${getSongUrl(bookId, songId)}/history/${requireId(revision, "Revision")}`, { signal })
}

export function restoreSong(bookId, songId, revision, expectedRevision, { signal } = {}) {
    return request(`${getSongUrl(bookId, songId)}/history/${requireId(revision, "Revision")}/restore`, {
        method: "POST", json: { expectedRevision }, signal
    })
}
