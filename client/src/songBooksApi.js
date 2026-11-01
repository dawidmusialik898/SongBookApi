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

export function getSongBooks(page = 1, { signal } = {}) {
    return request(pageUrl(SONG_BOOKS_API_URL, page), { signal })
}

export function createSongBook(payload) {
    return request(SONG_BOOKS_API_URL, {
        method: "POST",
        json: payload
    })
}

export function getSongBook(songBookId, { signal } = {}) {
    return request(getSongBookUrl(songBookId), { signal })
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

export function getSongBookAccess(
    songBookId,
    page = 1,
    { signal } = {}
) {
    return request(
        pageUrl(getSongBookAccessUrl(songBookId), page),
        { signal }
    )
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

export function getSongBookPdfs(
    songBookId,
    page = 1,
    { signal } = {}
) {
    return request(
        pageUrl(getSongBookPdfsUrl(songBookId), page),
        { signal }
    )
}

export function createSongBookPdf(
    songBookId,
    { includeChords, songIds, fontFamily, fontSize, orientation, columns } = {}
) {
    const url = getSongBookPdfsUrl(songBookId)
    if (
        typeof includeChords !== "boolean" ||
        (fontFamily !== undefined && !["lato", "dejavu-sans-mono"].includes(fontFamily)) ||
        (fontSize !== undefined && (!Number.isInteger(fontSize) || fontSize < 8 || fontSize > 18)) ||
        (orientation !== undefined && !["portrait", "landscape"].includes(orientation)) ||
        (columns !== undefined && (!Number.isInteger(columns) || columns < 1 ||
            columns > (orientation === "landscape" ? 3 : 2))) ||
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
        json: {
            includeChords,
            ...(songIds === undefined ? {} : { songIds }),
            ...(fontFamily === undefined ? {} : { fontFamily }),
            ...(fontSize === undefined ? {} : { fontSize }),
            ...(orientation === undefined ? {} : { orientation }),
            ...(columns === undefined ? {} : { columns })
        }
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
