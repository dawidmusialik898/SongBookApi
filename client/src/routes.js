import { renderBookScreen } from "./screens/bookScreen.js"
import { renderLibraryScreen } from "./screens/libraryScreen.js"
import { renderNotFoundScreen } from "./screens/notFoundScreen.js"
import { renderPdfListScreen } from "./screens/pdfListScreen.js"
import { renderPdfNewScreen } from "./screens/pdfNewScreen.js"
import { renderShareScreen } from "./screens/shareScreen.js"
import { renderSongScreen } from "./screens/songScreen.js"
import { renderSongEditorScreen } from "./screens/songEditorScreen.js"
import { renderSongCopyScreen } from "./screens/songCopyScreen.js"
import { renderUsersScreen } from "./screens/usersScreen.js"
import { renderHistoryScreen } from "./screens/historyScreen.js"
import { renderHistoryCompareScreen } from "./screens/historyCompareScreen.js"
import { renderSharedScreen } from "./screens/sharedScreen.js"

const NOT_FOUND_ROUTE = Object.freeze({
    name: "not-found",
    screenName: "not-found",
    segments: null,
    minimumAccess: "anyone",
    focusMode: false,
    render: renderNotFoundScreen
})

const ROUTES = [
    ...[
        ["shared-book", ["shared", "books", ":bookId", ":token"]],
        ["shared-song", ["shared", "books", ":bookId", ":token", "songs", ":songId"]],
        ["shared-pdfs", ["shared", "books", ":bookId", ":token", "pdfs"]]
    ].map(([name, segments]) => ({
        name, screenName: name, segments, publicRead: true,
        minimumAccess: "anyone", focusMode: false, render: renderSharedScreen
    })),
    {
        name: "song-copy", screenName: "song-copy",
        segments: ["books", ":bookId", "songs", ":songId", "copy"],
        minimumAccess: "reader", focusMode: false, render: renderSongCopyScreen
    },
    {
        name: "book-history", screenName: "history",
        segments: ["books", ":bookId", "history"],
        minimumAccess: "reader", focusMode: false, render: renderHistoryScreen
    },
    {
        name: "song-history", screenName: "history",
        segments: ["books", ":bookId", "songs", ":songId", "history"],
        minimumAccess: "reader", focusMode: false, render: renderHistoryScreen
    },
    {
        name: "song-history-compare", screenName: "history-compare",
        segments: ["books", ":bookId", "songs", ":songId", "history", "compare"],
        minimumAccess: "reader", focusMode: false, render: renderHistoryCompareScreen
    },
    {
        name: "library",
        screenName: "library",
        segments: [],
        minimumAccess: "authenticated",
        focusMode: false,
        render: renderLibraryScreen
    },
    {
        name: "song-new",
        screenName: "song-editor",
        segments: ["books", ":bookId", "songs", "new"],
        minimumAccess: "editor",
        focusMode: true,
        render: renderSongEditorScreen
    },
    {
        name: "pdf-new",
        screenName: "pdf-new",
        segments: ["books", ":bookId", "pdfs", "new"],
        minimumAccess: "owner",
        focusMode: false,
        render: renderPdfNewScreen
    },
    {
        name: "song-edit",
        screenName: "song-editor",
        segments: ["books", ":bookId", "songs", ":songId", "edit"],
        minimumAccess: "editor",
        focusMode: true,
        render: renderSongEditorScreen
    },
    {
        name: "song",
        screenName: "song",
        segments: ["books", ":bookId", "songs", ":songId"],
        minimumAccess: "reader",
        focusMode: false,
        render: renderSongScreen
    },
    {
        name: "pdfs",
        screenName: "pdfs",
        segments: ["books", ":bookId", "pdfs"],
        minimumAccess: "reader",
        focusMode: false,
        render: renderPdfListScreen
    },
    {
        name: "share",
        screenName: "share",
        segments: ["books", ":bookId", "share"],
        minimumAccess: "owner",
        focusMode: false,
        render: renderShareScreen
    },
    {
        name: "book",
        screenName: "book",
        segments: ["books", ":bookId"],
        minimumAccess: "reader",
        focusMode: false,
        render: renderBookScreen
    },
    {
        name: "users",
        screenName: "users",
        segments: ["users"],
        minimumAccess: "moderator",
        focusMode: false,
        render: renderUsersScreen
    }
]

export function buildHref(name, params = {}, query = {}) {
    const route = ROUTES.find(candidate => candidate.name === name)
    if (name === "not-found") {
        return "#/not-found"
    }
    if (route === undefined) {
        throw new TypeError(`Unknown route name: ${name}`)
    }

    const path = route.segments.length === 0
        ? "/"
        : `/${route.segments.map(segment =>
            segment.startsWith(":")
                ? encodeURIComponent(requireParam(
                    params,
                    segment.slice(1)
                ))
                : segment
        ).join("/")}`
    if (name !== "book" && name !== "shared-book") {
        return `#${path}`
    }

    const search = typeof query.q === "string"
        ? query.q.trim()
        : ""
    return `#${path}${search === ""
        ? ""
        : `?q=${encodeURIComponent(search)}`}`
}

export function parseLocation(hash) {
    const value = typeof hash === "string"
        ? hash.startsWith("#")
            ? hash.slice(1)
            : hash
        : ""
    const source = value === "" ? "/" : value
    const queryIndex = source.indexOf("?")
    const rawPath = queryIndex === -1
        ? source
        : source.slice(0, queryIndex)
    const path = rawPath === "" ? "/" : rawPath
    const search = queryIndex === -1
        ? ""
        : source.slice(queryIndex + 1)
    const searchParams = new URLSearchParams(search)
    const query = {}
    if (searchParams.has("q")) {
        query.q = searchParams.get("q") ?? ""
    }
    return {
        path: path.startsWith("/") ? path : `/${path}`,
        fullPath: `${path.startsWith("/") ? path : `/${path}`}` +
            (search === "" ? "" : `?${search}`),
        searchParams,
        query
    }
}

export function resolveRoute(location) {
    const rawSegments = location.path === "/"
        ? []
        : location.path.slice(1).split("/")

    for (const route of ROUTES) {
        if (route.segments.length !== rawSegments.length) {
            continue
        }

        const params = {}
        let matches = true
        for (const [index, expected] of route.segments.entries()) {
            let actual
            try {
                actual = decodeURIComponent(rawSegments[index])
            } catch {
                matches = false
                break
            }

            if (expected.startsWith(":")) {
                if (actual === "") {
                    matches = false
                    break
                }
                params[expected.slice(1)] = actual
            } else if (actual !== expected) {
                matches = false
                break
            }
        }
        if (matches) {
            return {
                route,
                params,
                query: route.name === "book" || route.name === "shared-book"
                    ? { ...(location.query.q === undefined
                        ? {}
                        : { q: location.query.q }) }
                    : {}
            }
        }
    }

    return {
        route: NOT_FOUND_ROUTE,
        params: {},
        query: {}
    }
}

export function normalizePath(path) {
    if (typeof path !== "string") {
        throw new TypeError("A navigation path must be a string.")
    }
    const value = path.startsWith("#") ? path.slice(1) : path
    if (value === "") {
        return "/"
    }
    if (!value.startsWith("/")) {
        throw new TypeError("A navigation path must start with '/'.")
    }
    return value
}

function requireParam(params, name) {
    const value = params[name]
    if (
        value === null ||
        value === undefined ||
        String(value) === ""
    ) {
        throw new TypeError(`Route parameter ${name} is required.`)
    }
    return String(value)
}
