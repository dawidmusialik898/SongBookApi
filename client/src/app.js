import { resetAntiforgeryToken } from "./httpClient.js"
import { handleError } from "./errorHandler.js"
import { createDialogs } from "./ui/dialog.js"
import { createSession } from "./session.js"
import { createRouter } from "./router.js"
import { createShell } from "./ui/shell.js"
import { createStatus } from "./ui/status.js"
import { createDrafts } from "./drafts.js"
import { parseLocation, resolveRoute } from "./routes.js"

const SHELL_ELEMENTS = [
    ["appBar", "app-bar"],
    ["homeLink", "app-home-link"],
    ["appBreadcrumb", "app-breadcrumb"],
    ["accountMenu", "account-menu"],
    ["screen", "screen"],
    ["status", "app-status"],
    ["dialog", "app-dialog"]
]

export function startApp() {
    const elements = {}
    for (const [property, id] of SHELL_ELEMENTS) {
        const element = document.getElementById(id)
        if (element === null) {
            throw new Error(`The app shell is missing #${id}.`)
        }
        elements[property] = element
    }

    resetAntiforgeryToken()
    const ctx = {
        elements,
        session: null,
        router: null,
        status: null,
        dialogs: null,
        drafts: createDrafts(),
        cache: { bookList: null },
        prefs: { showChords: true },
        auth: {
            view: "login",
            emailPrefill: "",
            resetCredentials: null,
            draftRestored: false,
            forceAuth: false
        },
        pendingStatus: null,
        currentView: null
    }
    ctx.status = createStatus(elements.status)
    ctx.dialogs = createDialogs(elements.dialog)
    ctx.shell = createShell(ctx)
    ctx.session = createSession(ctx)
    ctx.router = createRouter(ctx)
    ctx.handleError = (error, scope) => handleError(ctx, error, scope)
    ctx.registerMenu = menu => ctx.shell.registerMenu(menu)
    ctx.setTitle = parts => ctx.shell.setTitle(parts)
    ctx.setBreadcrumb = items => ctx.shell.setBreadcrumb(items)
    handleAuthQuery(ctx)

    window.history.scrollRestoration = "manual"
    window.addEventListener("hashchange", () =>
        ctx.router.handleHashChange()
    )
    window.addEventListener("beforeunload", event => {
        ctx.currentView?.beforeUnload?.(event)
        if (ctx.currentView?.isDirty?.() === true) {
            event.preventDefault()
            event.returnValue = ""
        }
    })
    document.body.addEventListener("click", event => {
        ctx.shell.closeMenusOutside(event.target)
        if (
            event.defaultPrevented ||
            event.button !== undefined && event.button !== 0 ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
        ) {
            return
        }

        let target = event.target
        let link = null
        while (target !== null && target !== document.body) {
            if (
                target.tagName === "A" &&
                target.getAttribute("href")?.startsWith("#/")
            ) {
                link = target
                break
            }
            target = target.parentNode
        }
        if (link === null) {
            return
        }

        event.preventDefault()
        return ctx.router.navigate(link.getAttribute("href"))
    })
    document.body.addEventListener("keydown", async event => {
        ctx.shell.handleKeydown(event)
        if (!event.defaultPrevented) {
            await ctx.currentView?.onKeydown?.(event)
        }
    })

    const publicRead = resolveRoute(parseLocation(window.location.hash)).route.publicRead &&
        !ctx.auth.forceAuth
    const sessionLoad = ctx.session.load()
    const initialRender = ctx.router.render({ initial: true })
    const ready = publicRead
        ? initialRender
        : Promise.all([initialRender, sessionLoad]).then(() => ctx.router.start())
    if (publicRead) {
        void sessionLoad.then(() => {
            ctx.shell.renderAccountMenu()
            if (!ctx.router.current?.route.publicRead) {
                return ctx.router.render()
            }
        })
    }
    return {
        ready,
        navigate: ctx.router.navigate,
        context: ctx
    }
}

function handleAuthQuery(ctx) {
    const currentUrl = new URL(window.location.href)
    const authResult = currentUrl.searchParams.get("auth")
    let notice = null

    if (authResult === "confirmed") {
        notice = {
            type: "success",
            message: "Email confirmed. You can now sign in."
        }
    } else if (authResult === "confirmation-failed") {
        notice = {
            type: "error",
            message: "The confirmation link is invalid or expired."
        }
    } else if (authResult === "reset-password") {
        const email = currentUrl.searchParams.get("email")
        const code = currentUrl.searchParams.get("code")
        if (
            typeof email === "string" &&
            email !== "" &&
            typeof code === "string" &&
            code !== ""
        ) {
            ctx.auth.resetCredentials = { email, code }
            ctx.auth.emailPrefill = email
            ctx.auth.view = "reset-password"
            ctx.auth.forceAuth = true
        } else {
            notice = {
                type: "error",
                message: "The password reset link is invalid or incomplete."
            }
        }
    }

    if (authResult !== null) {
        currentUrl.searchParams.delete("auth")
        currentUrl.searchParams.delete("email")
        currentUrl.searchParams.delete("code")
        const search = currentUrl.searchParams.toString()
        const sanitizedUrl = currentUrl.pathname +
            (search === "" ? "" : `?${search}`) +
            currentUrl.hash
        window.history.replaceState(
            window.history.state,
            "",
            sanitizedUrl
        )
    }

    ctx.pendingStatus = notice
}
