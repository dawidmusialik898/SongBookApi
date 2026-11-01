import { renderAuthScreen } from "./screens/authScreen.js"
import {
    renderLoadingScreen,
    renderUnavailableScreen
} from "./screens/systemScreens.js"
import {
    buildHref,
    normalizePath,
    parseLocation,
    resolveRoute
} from "./routes.js"

export function createRouter(ctx) {
    const href = buildHref
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
        if (!["book", "shared-book"].includes(current?.route.name)) {
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

        let sessionGeneration = ctx.session.state.generation
        let screenName = resolved.route.screenName ??
            resolved.route.name
        let screen = resolved.route.render
        if (ctx.auth.forceAuth) {
            screenName = "auth"
            screen = renderAuthScreen
        } else if (resolved.route.publicRead) {
            // Public capability reads do not depend on the account service.
        } else if (ctx.session.state.status === "loading") {
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
            async refreshSession() {
                const state = await ctx.session.load()
                if (
                    renderId === renderCount &&
                    !controller.signal.aborted
                ) {
                    sessionGeneration = ctx.session.state.generation
                    screenContext.sessionGeneration = sessionGeneration
                }
                return state
            },
            setTitle: parts => ctx.shell.setTitle(parts),
            setBreadcrumb: items => ctx.shell.setBreadcrumb(items),
            navigate,
            goBackOr,
            href,
            handleError: (error, scope) =>
                ctx.handleError(error, scope),
            registerMenu: menu => ctx.shell.registerMenu(menu),
            unregisterMenu: menu => ctx.shell.unregisterMenu(menu)
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
