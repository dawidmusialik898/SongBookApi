import { request } from "./httpClient.js"
import { pageUrl } from "./pagination.js"

export function getShareLink(bookId, { signal } = {}) {
    return request(`/songbooks/${encodeURIComponent(bookId)}/share-link`, {
        signal, cache: "no-store"
    })
}

export function replaceShareLink(bookId, { signal } = {}) {
    return request(`/songbooks/${encodeURIComponent(bookId)}/share-link`, {
        method: "POST", signal, cache: "no-store"
    })
}

export function revokeShareLink(bookId, { signal } = {}) {
    return request(`/songbooks/${encodeURIComponent(bookId)}/share-link`, {
        method: "DELETE", signal, cache: "no-store"
    })
}

export function createSharedReadApi(bookId, token) {
    const base = `/shared/songbooks/${encodeURIComponent(bookId)}`
    function read(path, { signal, responseType = "json" } = {}) {
        return request(path, {
            signal, responseType, cache: "no-store", referrerPolicy: "no-referrer",
            headers: { "X-SongBook-Share-Token": token }
        })
    }
    return {
        getSongBook: (_id, options) => read(base, options),
        getSongs: (_id, page = 1, { search = "", signal } = {}) =>
            read(pageUrl(`${base}/songs`, page, { search: search.trim() }), { signal }),
        getSong: (_id, songId, options) =>
            read(`${base}/songs/${encodeURIComponent(songId)}`, options),
        getAdjacentSongs: (_id, songId, options) =>
            read(`${base}/songs/${encodeURIComponent(songId)}/adjacent`, options),
        getSongBookPdfs: (_id, page = 1, options) =>
            read(pageUrl(`${base}/pdfs`, page), options),
        downloadSongBookPdf: (_id, pdfId, options = {}) =>
            read(`${base}/pdfs/${encodeURIComponent(pdfId)}/download`, {
                ...options, responseType: "blob"
            })
    }
}
