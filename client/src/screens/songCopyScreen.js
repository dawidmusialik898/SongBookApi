import { ApiError } from "../httpClient.js"
import { copySong, getSong } from "../songsApi.js"
import { getSongBooks } from "../songBooksApi.js"
import { readPage } from "../pagination.js"
import { h } from "../ui/dom.js"
import { displayValue, normalizeAccessLevel } from "../ui/format.js"
import { getCopySongErrorMessage, getLoadSongBooksErrorMessage } from "../ui/errors.js"
import { createPagedList } from "../ui/pagedList.js"

export async function renderSongCopyScreen(ctx) {
    const { bookId, songId } = ctx.params
    const sessionGeneration = ctx.session.state.generation
    let selectedId = null
    let busy = false
    let nextSourcePage = 1
    const options = []
    const heading = h("h1", {
        id: "screen-heading", attrs: { tabindex: "-1" }, text: "Copy song"
    })
    const state = h("p", { id: "copy-destinations-state", className: "list-state" })
    const list = h("ul", { id: "copy-destinations", className: "pdf-song-list" })
    const more = h("button", {
        id: "copy-show-more", type: "button", className: "button button--neutral",
        text: "Show more", hidden: true, disabled: true
    })
    const errorElement = h("p", {
        id: "copy-song-error", className: "form-error",
        attrs: { role: "alert" }, hidden: true
    })
    const submit = h("button", {
        id: "copy-song-button", type: "submit", className: "button button--primary",
        text: "Copy song", disabled: true
    })
    const form = h("form", {
        id: "copy-song-form", hidden: true,
        on: { submit: event => submitCopy(event) }
    },
    h("p", { text: "Choose a different song book where you can edit songs. The original stays unchanged." }),
    h("fieldset", {},
        h("legend", { text: "Destination song book" }), list, state, more),
    errorElement,
    h("div", { className: "screen-actions" },
        h("a", {
            id: "cancel-copy-link", className: "button button--neutral",
            attrs: { href: ctx.href("song", { bookId, songId }) }, text: "Cancel"
        }), submit))
    ctx.setTitle(["Copy song"])
    ctx.setBreadcrumb([{ text: "Copy song" }])
    ctx.root.replaceChildren(heading, form)

    const picker = createPagedList({
        list, stateElement: state, moreButton: more,
        signal: ctx.signal,
        fetchPage: async (page, signal) => {
            let sourcePage = page === 1 ? 1 : nextSourcePage
            for (;;) {
                let response
                try {
                    response = await getSongBooks(sourcePage, { signal })
                } catch (error) {
                    if (isCurrent() && !signal.aborted &&
                        error instanceof ApiError && error.status === 401) {
                        await ctx.handleError(error, { signal, isCurrent })
                    }
                    throw error
                }
                const result = readPage(response, sourcePage)
                if (!isCurrent() || signal.aborted) {
                    throw new DOMException("Navigation cancelled", "AbortError")
                }
                const items = result.items.filter(book =>
                    String(book.id).toLowerCase() !== bookId.toLowerCase() &&
                    ["admin", "editor"].includes(normalizeAccessLevel(book.accessLevel))
                )
                sourcePage += 1
                if (items.length > 0 || !result.hasNext) {
                    nextSourcePage = sourcePage
                    return { items, page, hasNext: result.hasNext }
                }
            }
        },
        renderItem: book => {
            const radio = h("input", {
                type: "radio",
                attrs: { name: "destination", value: book.id },
                dataset: { bookId: book.id },
                on: {
                    change: () => {
                        if (!isCurrent() || busy) return
                        selectedId = book.id
                        for (const option of options) {
                            option.checked = option === radio
                        }
                        errorElement.hidden = true
                        submit.disabled = false
                    }
                }
            })
            radio.checked = selectedId === book.id
            radio.disabled = busy
            options.push(radio)
            return h("li", {}, h("label", { className: "pdf-song-option" },
                radio, h("span", { text: displayValue(book.name, "Untitled song book") })))
        },
        getKey: book => book.id,
        messages: {
            loading: "Loading destination song books…",
            empty: () => h("span", {
                text: "No writable destination song books. Create another book or ask its owner for editor access."
            }),
            error: error => getLoadSongBooksErrorMessage(error)
        }
    })

    try {
        const song = await getSong(bookId, songId, { signal: ctx.signal })
        if (!isCurrent()) return { cleanup: picker.destroy }
        if (!song || typeof song !== "object") throw new TypeError("Invalid source song.")
        ctx.setTitle(["Copy song", displayValue(song.title, "Untitled song")])
        ctx.setBreadcrumb([
            { text: displayValue(song.title, "Untitled song"), href: ctx.href("song", { bookId, songId }) },
            { text: "Copy song" }
        ])
        form.hidden = false
        await picker.reload()
    } catch (error) {
        if (isCurrent() && error?.name !== "AbortError") {
            await ctx.handleError(error, {
                type: "song", bookId, songId, signal: ctx.signal, isCurrent
            })
        }
    }
    return { focusTarget: heading, cleanup: picker.destroy }

    function isCurrent() {
        return ctx.isCurrent() && ctx.session.state.generation === sessionGeneration
    }

    async function submitCopy(event) {
        event.preventDefault()
        if (!isCurrent() || busy) return
        if (!selectedId) {
            errorElement.textContent = "Choose a destination song book."
            errorElement.hidden = false
            return
        }
        const destinationBookId = selectedId
        busy = true
        submit.disabled = true
        submit.textContent = "Copying…"
        form.setAttribute("aria-busy", "true")
        for (const option of options) option.disabled = true
        errorElement.hidden = true
        try {
            const song = await copySong(destinationBookId, bookId, songId, { signal: ctx.signal })
            if (!isCurrent()) return
            if (!song?.id) throw new TypeError("Invalid copied song.")
            ctx.cache.bookList = null
            await ctx.navigate(ctx.href("song", { bookId: destinationBookId, songId: song.id }), {
                status: "Song copied."
            })
        } catch (error) {
            if (!isCurrent() || error?.name === "AbortError") return
            if (error instanceof ApiError && error.status === 401) {
                await ctx.handleError(error, {
                    type: "mutation", bookId: destinationBookId,
                    signal: ctx.signal, path: ctx.router.current?.path, isCurrent
                })
                return
            }
            errorElement.textContent = getCopySongErrorMessage(error)
            errorElement.hidden = false
        } finally {
            if (isCurrent()) {
                busy = false
                submit.disabled = !selectedId
                submit.textContent = "Copy song"
                form.setAttribute("aria-busy", "false")
                for (const option of options) option.disabled = false
            }
        }
    }
}
