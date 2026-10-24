import { ApiError } from "../httpClient.js"
import { createSongBook, getSongBooks } from "../songBooksApi.js"
import {
    displayValue,
    formatCount,
    normalizeAccessLevel
} from "../ui/format.js"
import { h } from "../ui/dom.js"
import {
    getLoadSongBooksErrorMessage,
    getSaveSongBookErrorMessage
} from "../ui/errors.js"
import { createPagedList } from "../ui/pagedList.js"

export async function renderLibraryScreen(ctx) {
    ctx.setBreadcrumb([])
    ctx.setTitle(["Song books"])

    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "Song books"
    })
    const newBookButton = h("button", {
        id: "new-song-book-button",
        className: "button button--primary",
        type: "button",
        text: "New song book",
        on: {
            click: () => {
                void createSongBookFromPrompt(ctx)
            }
        }
    })
    const header = h("header", {
        className: "screen-header"
    }, heading, h("div", {
        className: "screen-actions"
    }, newBookButton))
    const list = h("ul", {
        id: "song-book-list",
        className: "row-list"
    })
    const stateElement = h("p", {
        id: "song-book-list-state",
        className: "list-state"
    })
    const moreButton = h("button", {
        id: "show-more-song-books",
        className: "button button--neutral",
        type: "button",
        attrs: { "aria-label": "Show more song books" },
        hidden: true,
        disabled: true,
        text: "Show more"
    })
    ctx.root.replaceChildren(
        header,
        list,
        stateElement,
        moreButton
    )

    const pagedList = createPagedList({
        list,
        stateElement,
        moreButton,
        fetchPage: async (page, signal) => {
            try {
                return await getSongBooks(page, { signal })
            } catch (error) {
                if (error instanceof ApiError && error.status === 401) {
                    await ctx.handleError(error, "library")
                }
                throw error
            }
        },
        renderItem: songBook => renderSongBook(songBook, ctx),
        getKey: songBook => songBook.id,
        messages: {
            loading: "Loading song books…",
            empty: () => h("span", {
                text: "No song books yet. Create your first one."
            }),
            error: error => getLoadSongBooksErrorMessage(error)
        },
        signal: ctx.signal
    })

    await pagedList.reload()
    if (!ctx.isCurrent()) {
        return {}
    }
    return { focusTarget: heading }
}

function renderSongBook(songBook, ctx) {
    const name = displayValue(songBook.name, "Untitled song book")
    const accessLevel = normalizeAccessLevel(songBook.accessLevel)
    const sharedLabel = accessLevel === "reader"
        ? " · Shared with you (Reader)"
        : accessLevel === "editor"
            ? " · Shared with you (Editor)"
            : ""
    const meta = `${formatCount(songBook.songCount, "song")}${sharedLabel}`
    const link = h("a", {
        className: "row-link",
        attrs: {
            href: ctx.href("book", { bookId: songBook.id }),
            "data-song-book-id": songBook.id
        }
    },
    h("span", {
        className: "row-link__title",
        text: name
    }),
    h("span", {
        className: "row-link__meta",
        text: meta
    }))
    return h("li", {}, link)
}

async function createSongBookFromPrompt(ctx) {
    const requestGeneration = ctx.session.state.generation
    let createdSongBook = null
    const value = await ctx.dialogs.promptDialog({
        title: "New song book",
        label: "Name",
        maxLength: 100,
        required: true,
        confirmLabel: "Create",
        submit: async name => {
            if (
                !ctx.isCurrent() ||
                requestGeneration !== ctx.session.state.generation
            ) {
                return null
            }

            try {
                const created = await createSongBook({ name })
                if (
                    !ctx.isCurrent() ||
                    requestGeneration !== ctx.session.state.generation
                ) {
                    return null
                }
                if (
                    created === null ||
                    typeof created !== "object" ||
                    typeof created.id !== "string" ||
                    created.id === ""
                ) {
                    await ctx.handleError(
                        new TypeError(
                            "The API returned an invalid song book."
                        ),
                        "programmer"
                    )
                    return "The song book could not be created. Try again."
                }
                createdSongBook = created
                return null
            } catch (error) {
                if (error instanceof ApiError && error.status === 409) {
                    return getSaveSongBookErrorMessage(error, "create")
                }
                if (error instanceof ApiError && error.status === 401) {
                    await ctx.handleError(error, "mutation")
                    return "Your session ended. Sign in to retry."
                }
                return getSaveSongBookErrorMessage(error, "create")
            }
        }
    })

    if (
        value === null ||
        createdSongBook === null ||
        !ctx.isCurrent() ||
        requestGeneration !== ctx.session.state.generation
    ) {
        return
    }

    await ctx.router.navigate(
        ctx.href("book", { bookId: createdSongBook.id }),
        { status: "Song book created." }
    )
}
