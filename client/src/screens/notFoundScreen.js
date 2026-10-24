import { h } from "../ui/dom.js"

export function renderNotFoundScreen(ctx) {
    ctx.setBreadcrumb([])
    ctx.setTitle(["Page not found"])
    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "Page not found"
    })
    const link = h("a", {
        id: "not-found-home-link",
        className: "button button--neutral",
        attrs: { href: ctx.href("library") },
        text: "Go to your song books"
    })
    ctx.root.replaceChildren(
        heading,
        h("p", {
            className: "screen-message",
            text: "This page doesn't exist."
        }),
        link
    )
    return { focusTarget: heading }
}
