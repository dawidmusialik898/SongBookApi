import { resetAntiforgeryToken } from "./httpClient.js"
import { handleError } from "./ui/errors.js"
import { createDialogs } from "./ui/dialog.js"
import { createSession } from "./session.js"
import { createRouter } from "./router.js"
import { handleAuthQuery } from "./screens/authScreen.js"
import { createShell } from "./ui/shell.js"
import { createStatus } from "./ui/status.js"
import { createDrafts } from "./drafts.js"

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

    const initialRender = ctx.router.render({ initial: true })
    const ready = Promise.all([
        initialRender,
        ctx.session.load()
    ]).then(() => ctx.router.start())
    return {
        ready,
        navigate: ctx.router.navigate,
        context: ctx
    }
}
