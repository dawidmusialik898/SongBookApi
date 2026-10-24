import { h } from "../ui/dom.js"

export function renderLoadingScreen(ctx) {
    ctx.setBreadcrumb([])
    ctx.setTitle(["Loading"])
    const heading = h("h1", {
        id: "screen-heading",
        className: "visually-hidden",
        attrs: { tabindex: "-1" },
        text: "Loading"
    })
    ctx.root.replaceChildren(
        heading,
        h("p", { className: "screen-message", text: "Loading…" })
    )
    return { focusTarget: heading }
}

export function renderUnavailableScreen(ctx) {
    ctx.setBreadcrumb([])
    ctx.setTitle(["Can't reach SongBook"])
    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "Can't reach SongBook"
    })
    const retry = h("button", {
        id: "retry-session-button",
        className: "button button--primary",
        type: "button",
        text: "Try again",
        on: {
            click: async () => {
                const loadedState = await ctx.session.load()
                if (
                    ctx.session.state.generation ===
                    loadedState.generation
                ) {
                    await ctx.router.render({ focus: true })
                }
            }
        }
    })
    ctx.root.replaceChildren(
        heading,
        h("p", {
            className: "screen-message",
            text: "Check your connection and try again."
        }),
        retry
    )
    return { focusTarget: heading }
}
