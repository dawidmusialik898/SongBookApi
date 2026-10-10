import { request } from "./httpClient.js"
import { pageUrl } from "./pagination.js"

const SONG_BOOKS_API_URL = "/songbooks"

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

function getSongBookUrl(songBookId) {
    return `${SONG_BOOKS_API_URL}/${requireId(
        songBookId,
        "Song book id"
    )}`
}

function getSongBookAccessUrl(songBookId) {
    return `${getSongBookUrl(songBookId)}/access`
}

function getSongBookPdfsUrl(songBookId) {
    return `${getSongBookUrl(songBookId)}/pdfs`
}

export function getSongBooks(page = 1) {
    return request(pageUrl(SONG_BOOKS_API_URL, page))
}

export function createSongBook(payload) {
    return request(SONG_BOOKS_API_URL, {
        method: "POST",
        json: payload
    })
}

export function getSongBook(songBookId) {
    return request(getSongBookUrl(songBookId))
}

export function renameSongBook(songBookId, payload) {
    return request(getSongBookUrl(songBookId), {
        method: "PUT",
        json: payload
    })
}

export function deleteSongBook(songBookId) {
    return request(getSongBookUrl(songBookId), {
        method: "DELETE"
    })
}

export function getSongBookAccess(songBookId, page = 1) {
    return request(pageUrl(getSongBookAccessUrl(songBookId), page))
}

export function setSongBookAccess(songBookId, payload) {
    return request(getSongBookAccessUrl(songBookId), {
        method: "PUT",
        json: payload
    })
}

export function removeSongBookAccess(songBookId, accessId) {
    return request(
        `${getSongBookAccessUrl(songBookId)}/${requireId(
            accessId,
            "Access entry id"
        )}`,
        { method: "DELETE" }
    )
}

export function getSongBookPdfs(songBookId, page = 1) {
    return request(pageUrl(getSongBookPdfsUrl(songBookId), page))
}

export function createSongBookPdf(
    songBookId,
    { includeChords, songIds } = {}
) {
    const url = getSongBookPdfsUrl(songBookId)
    if (
        typeof includeChords !== "boolean" ||
        (
            songIds !== undefined &&
            (
                !Array.isArray(songIds) ||
                songIds.length === 0 ||
                songIds.some(id =>
                    typeof id !== "string" || id.trim() === ""
                ) ||
                new Set(songIds).size !== songIds.length
            )
        )
    ) {
        throw new TypeError("Invalid PDF generation options.")
    }

    return request(url, {
        method: "POST",
        json: songIds === undefined
            ? { includeChords }
            : { includeChords, songIds }
    })
}

export function downloadSongBookPdf(songBookId, pdfId) {
    return request(
        `${getSongBookPdfsUrl(songBookId)}/${requireId(
            pdfId,
            "PDF id"
        )}/download`,
        { responseType: "blob" }
    )
}
