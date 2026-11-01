import { createSharedReadApi } from "../shareLinksApi.js"
import { h } from "../ui/dom.js"
import { renderBookScreen } from "./bookScreen.js"
import { renderSongScreen } from "./songScreen.js"
import { renderPdfListScreen } from "./pdfListScreen.js"

export async function renderSharedScreen(ctx) {
    const { bookId, token } = ctx.params
    const render = ctx.route.name === "shared-song" ? renderSongScreen :
        ctx.route.name === "shared-pdfs" ? renderPdfListScreen : renderBookScreen
    const view = await render({
        ...ctx,
        publicRead: true,
        readApi: createSharedReadApi(bookId, token),
        href: (name, params = {}, query = {}) =>
            ctx.href(`shared-${name}`, { ...params, bookId, token }, query),
        handleError(error) {
            if (!ctx.isCurrent() || error?.name === "AbortError") return
            ctx.root.replaceChildren(h("h1", {
                id: "screen-heading", attrs: { tabindex: "-1" },
                text: "Shared song book unavailable"
            }), h("p", {
                text: error?.status === 404
                    ? "This link is invalid or has been revoked."
                    : error?.status === 429
                        ? "Too many requests. Try again in a minute."
                        : "The shared song book could not be loaded. Try again."
            }))
        }
    })
    if (ctx.isCurrent()) {
        ctx.root.insertBefore(h("p", {
            id: "shared-read-only", className: "book-meta",
            text: "Shared song book - read-only"
        }), ctx.root.children[0] ?? null)
    }
    return view
}
