import { renderAuthScreen } from "./screens/authScreen.js"
import { renderBookScreen } from "./screens/bookScreen.js"
import { renderLibraryScreen } from "./screens/libraryScreen.js"
import { renderNotFoundScreen } from "./screens/notFoundScreen.js"
import { renderSongScreen } from "./screens/songScreen.js"
import { renderSongEditorScreen } from "./screens/songEditorScreen.js"
import {
    renderLoadingScreen,
    renderUnavailableScreen
} from "./screens/systemScreens.js"

const NOT_FOUND_ROUTE = Object.freeze({
    name: "not-found",
    screenName: "not-found",
    segments: null,
    minimumAccess: "anyone",
    focusMode: false,
    render: renderNotFoundScreen
})

const ROUTES = [
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
        screenName: "not-found",
        segments: ["books", ":bookId", "pdfs", "new"],
        minimumAccess: "owner",
        focusMode: false,
        render: renderNotFoundScreen
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
        screenName: "not-found",
        segments: ["books", ":bookId", "pdfs"],
        minimumAccess: "reader",
        focusMode: false,
        render: renderNotFoundScreen
    },
    {
        name: "share",
        screenName: "not-found",
        segments: ["books", ":bookId", "share"],
        minimumAccess: "owner",
        focusMode: false,
        render: renderNotFoundScreen
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
        screenName: "not-found",
        segments: ["users"],
        minimumAccess: "moderator",
        focusMode: false,
        render: renderNotFoundScreen
    }
]

export function createRouter(ctx) {
    let renderCount = 0
    let current = null
    let activeController = null
    let historyPaths = [readCurrentPath()]
    let historyIndex = 0
    let pendingBack = null

    async function start() {
        const status = ctx.pendingStatus
        ctx.pendingStatus = null
        return render({
            initial: true,
            status
        })
    }

    async function navigate(path, {
        replace = false,
        status = null
    } = {}) {
        const targetPath = normalizePath(path)
        const currentPath = readCurrentPath()

        if (targetPath !== currentPath) {
            if (replace) {
                window.history.replaceState(
                    null,
                    "",
                    `#${targetPath}`
                )
                historyPaths[historyIndex] = targetPath
            } else {
                window.history.pushState(
                    null,
                    "",
                    `#${targetPath}`
                )
                historyPaths.splice(historyIndex + 1)
                historyPaths.push(targetPath)
                historyIndex = historyPaths.length - 1
            }
        } else if (replace) {
            window.history.replaceState(
                null,
                "",
                `#${targetPath}`
            )
            historyPaths[historyIndex] = targetPath
        }

        return render({
            focus: true,
            status
        })
    }

    async function goBackOr(path, { status = null } = {}) {
        const targetPath = normalizePath(path)
        if (
            historyIndex > 0 &&
            historyPaths[historyIndex - 1] === targetPath
        ) {
            return new Promise(resolve => {
                pendingBack = { targetPath, status, resolve }
                window.history.back()
            })
        }

        return navigate(targetPath, { replace: true, status })
    }

    function replaceQuery(query = {}) {
        const location = parseLocation(window.location.hash)
        if (current?.route.name !== "book") {
            return current?.query ?? {}
        }

        const rawValue = query instanceof URLSearchParams
            ? query.get("q")
            : query?.q
        const search = typeof rawValue === "string"
            ? rawValue.trim()
            : ""
        const targetPath = location.path +
            (search === ""
                ? ""
                : `?q=${encodeURIComponent(search)}`)
        window.history.replaceState(
            window.history.state,
            "",
            `#${targetPath}`
        )
        historyPaths[historyIndex] = targetPath
        current.path = targetPath
        current.query = search === "" ? {} : { q: search }
        return current.query
    }

    async function handleHashChange() {
        const path = readCurrentPath()
        if (historyIndex > 0 && historyPaths[historyIndex - 1] === path) {
            historyIndex -= 1
        } else if (
            historyIndex + 1 < historyPaths.length &&
            historyPaths[historyIndex + 1] === path
        ) {
            historyIndex += 1
        } else if (historyPaths[historyIndex] !== path) {
            historyPaths.splice(historyIndex + 1)
            historyPaths.push(path)
            historyIndex = historyPaths.length - 1
        }

        const pending = pendingBack
        const result = await render({
            traversal: true,
            focus: true,
            status: pending?.targetPath === path
                ? pending.status
                : null
        })
        if (pendingBack === pending && pending !== null) {
            pendingBack = null
            if (pending.targetPath === path) {
                pending.resolve(result)
            } else {
                const fallback = await navigate(pending.targetPath, {
                    replace: true,
                    status: pending.status
                })
                pending.resolve(fallback)
            }
        }
        return result
    }

    async function render({
        traversal = false,
        focus = false,
        initial = false,
        status = null
    } = {}) {
        const renderId = ++renderCount
        const previousController = activeController
        const previousView = current?.view ?? ctx.currentView
        previousController?.abort()

        let cleanupStatus = null
        if (previousView?.cleanup !== undefined) {
            cleanupStatus = await previousView.cleanup()
        }
        if (renderId !== renderCount) {
            return { cleanupStatus }
        }

        ctx.shell.closeMenus()
        ctx.dialogs.close()
        ctx.status.clear()

        let location = parseLocation(window.location.hash)
        let resolved = resolveRoute(location)
        let nextStatus = status
        if (
            ctx.session.state.status === "authenticated" &&
            resolved.route.minimumAccess === "moderator" &&
            !["moderator", "superuser"].includes(ctx.session.state.role)
        ) {
            replaceCurrentPath("/")
            location = parseLocation("#/")
            resolved = resolveRoute(parseLocation("#/"))
            nextStatus ??= {
                type: "error",
                message: "You don't have access to user management."
            }
        }

        const sessionGeneration = ctx.session.state.generation
        let screenName = resolved.route.screenName ??
            resolved.route.name
        let screen = resolved.route.render
        if (ctx.session.state.status === "loading") {
            screenName = "loading"
            screen = renderLoadingScreen
        } else if (ctx.session.state.status === "unavailable") {
            screenName = "unavailable"
            screen = renderUnavailableScreen
        } else if (
            ctx.session.state.status === "anonymous" ||
            ctx.auth.forceAuth
        ) {
            screenName = "auth"
            screen = renderAuthScreen
        }

        const controller = new AbortController()
        activeController = controller
        current = {
            route: resolved.route,
            params: resolved.params,
            query: resolved.query,
            path: location.fullPath,
            view: null
        }
        ctx.currentView = null
        ctx.shell.setFocusMode(
            screenName !== "auth" &&
            screenName !== "loading" &&
            screenName !== "unavailable" &&
            resolved.route.focusMode
        )
        ctx.shell.renderAccountMenu()

        const root = ctx.elements.screen
        root.dataset.screen = screenName
        root.setAttribute("aria-busy", "true")
        root.replaceChildren()
        const screenContext = {
            ...ctx,
            root,
            params: resolved.params,
            query: resolved.query,
            route: resolved.route,
            screenName,
            signal: controller.signal,
            sessionGeneration,
            traversal,
            isCurrent() {
                return renderId === renderCount &&
                    !controller.signal.aborted &&
                    ctx.session.state.generation === sessionGeneration
            },
            setTitle: parts => ctx.shell.setTitle(parts),
            setBreadcrumb: items => ctx.shell.setBreadcrumb(items),
            navigate,
            goBackOr,
            href,
            handleError: (error, scope) =>
                ctx.handleError(error, scope),
            registerMenu: menu => ctx.shell.registerMenu(menu)
        }

        try {
            const view = await screen(screenContext) ?? {}
            if (!screenContext.isCurrent()) {
                return { cleanupStatus }
            }

            current.view = view
            ctx.currentView = view
            root.setAttribute("aria-busy", "false")
            if (traversal) {
                const snapshot = ctx.cache.bookList
                if (
                    resolved.route.name === "book" &&
                    snapshot?.bookId === resolved.params.bookId &&
                    snapshot.q === (resolved.query.q ?? "")
                ) {
                    window.scrollTo(0, snapshot.scrollY ?? 0)
                } else {
                    window.scrollTo(0, 0)
                }
            } else if (!initial) {
                window.scrollTo(0, 0)
            }

            if (focus && !initial) {
                const target = view.focusTarget ??
                    document.getElementById("screen-heading")
                target?.focus()
            }

            const visibleStatus = nextStatus ?? cleanupStatus
            if (visibleStatus !== null && visibleStatus !== undefined) {
                showStatus(visibleStatus)
            }
            return { cleanupStatus }
        } catch (error) {
            if (
                screenContext.isCurrent() &&
                error?.name !== "AbortError"
            ) {
                console.error(error)
                root.setAttribute("aria-busy", "false")
                ctx.status.show(
                    "error",
                    "Something went wrong. Try again."
                )
            }
            return { cleanupStatus }
        }
    }

    function href(name, params = {}, query = {}) {
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
        if (name !== "book") {
            return `#${path}`
        }

        const search = typeof query.q === "string"
            ? query.q.trim()
            : ""
        return `#${path}${search === ""
            ? ""
            : `?q=${encodeURIComponent(search)}`}`
    }

    function showStatus(value) {
        if (typeof value === "string") {
            ctx.status.show("success", value)
            return
        }
        if (
            value === null ||
            typeof value !== "object" ||
            typeof value.message !== "string"
        ) {
            throw new TypeError("A navigation status needs a message.")
        }
        ctx.status.show(
            value.type ?? "success",
            value.message,
            { action: value.action ?? null }
        )
    }

    function replaceCurrentPath(path) {
        window.history.replaceState(null, "", `#${path}`)
        historyPaths[historyIndex] = path
    }

    function readCurrentPath() {
        return parseLocation(window.location.hash).fullPath
    }

    return {
        start,
        navigate,
        goBackOr,
        replaceQuery,
        handleHashChange,
        render,
        href,
        get current() {
            return current
        }
    }
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

function resolveRoute(location) {
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
                query: route.name === "book"
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

function normalizePath(path) {
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
