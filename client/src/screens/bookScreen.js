import { ApiError } from "../httpClient.js"
import {
    deleteSongBook,
    getSongBook,
    renameSongBook
} from "../songBooksApi.js"
import { getSongs } from "../songsApi.js"
import { h } from "../ui/dom.js"
import {
    getDeleteSongBookErrorMessage,
    getLoadSongsErrorMessage,
    getSaveSongBookErrorMessage
} from "../ui/errors.js"
import { createMenu } from "../ui/menu.js"
import { createPagedList } from "../ui/pagedList.js"
import {
    displayValue,
    formatCount,
    normalizeAccessLevel
} from "../ui/format.js"

export async function renderBookScreen(ctx) {
    const bookId = ctx.params.bookId
    ctx.setBreadcrumb([])
    ctx.setTitle(["Song book"])
    const initialSearch = typeof ctx.query.q === "string"
        ? ctx.query.q.trim()
        : ""
    let activeSearch = initialSearch
    let debounceTimer = null
    let loadedBook = null
    let bookName = "Untitled song book"
    let accessLevel = null
    let snapshotInvalidated = false

    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "Loading…"
    })
    const meta = h("p", {
        id: "book-meta",
        className: "book-meta"
    })
    const actions = h("div", {
        className: "screen-actions"
    })
    const header = h("header", {
        className: "screen-header"
    }, heading, actions)
    const searchInput = h("input", {
        id: "song-search",
        type: "search",
        disabled: true,
        attrs: {
            maxlength: "100",
            placeholder: "Title, author or number"
        }
    })
    searchInput.value = initialSearch
    const searchForm = h("form", {
        id: "song-search-form",
        className: "form-field search-form",
        attrs: { role: "search" },
        on: {
            submit: event => {
                event.preventDefault()
                clearDebounce()
                return searchNow()
            }
        }
    },
    h("label", {
        attrs: { for: "song-search" },
        text: "Search songs"
    }),
    searchInput)
    const list = h("ul", {
        id: "song-list",
        className: "row-list",
        hidden: true
    })
    const stateElement = h("p", {
        id: "song-list-state",
        className: "list-state",
        text: "Loading songs…"
    })
    const moreButton = h("button", {
        id: "show-more-songs",
        className: "button button--neutral",
        type: "button",
        attrs: { "aria-label": "Show more songs" },
        hidden: true,
        disabled: true,
        text: "Show more"
    })
    ctx.root.replaceChildren(
        header,
        meta,
        searchForm,
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
                return await getSongs(bookId, page, {
                    search: activeSearch,
                    signal
                })
            } catch (error) {
                if (
                    error instanceof ApiError &&
                    [401, 403, 404].includes(error.status)
                ) {
                    await ctx.handleError(error, {
                        type: error.status === 401 ? "songs" : "book",
                        bookId,
                        signal,
                        isCurrent: ctx.isCurrent,
                        onBookUnavailable: invalidateSnapshot
                    })
                }
                throw error
            }
        },
        renderItem: song => renderSongRow(song, ctx, bookId),
        getKey: song => song.id,
        messages: {
            loading: "Loading songs…",
            empty: () => renderEmptyState(
                activeSearch,
                accessLevel,
                ctx,
                bookId
            ),
            error: error => getLoadSongsErrorMessage(error)
        },
        signal: ctx.signal
    })

    const cached = ctx.cache.bookList
    const savedSnapshot = ctx.traversal &&
        cached?.bookId === bookId &&
        cached.q === activeSearch &&
        cached.page > 0
        ? cached
        : null
    const listLoad = savedSnapshot === null
        ? pagedList.reload()
        : Promise.resolve()

    searchInput.addEventListener("input", () => {
        clearDebounce()
        debounceTimer = setTimeout(() => {
            debounceTimer = null
            void searchNow()
        }, 300)
    })

    function clearDebounce() {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer)
            debounceTimer = null
        }
    }

    async function searchNow() {
        if (!ctx.isCurrent()) {
            return
        }
        const search = searchInput.value.trim()
        if (search === activeSearch) {
            return
        }

        activeSearch = search
        ctx.router.replaceQuery({ q: search })
        await pagedList.reload()
    }

    function setBookDetails(book) {
        loadedBook = book
        bookName = displayValue(book.name, "Untitled song book")
        accessLevel = normalizeAccessLevel(book.accessLevel)
        heading.textContent = bookName
        meta.textContent = formatCount(book.songCount, "song") +
            (accessLevel === "reader"
                ? " · Shared with you (Reader)"
                : accessLevel === "editor"
                    ? " · Shared with you (Editor)"
                    : "")
        ctx.setTitle([bookName])
        ctx.setBreadcrumb([{ text: bookName }])
        renderActions()
        searchInput.disabled = false
        list.hidden = false
    }

    function renderActions() {
        actions.replaceChildren()
        if (accessLevel === "admin" || accessLevel === "editor") {
            actions.appendChild(h("a", {
                id: "add-song-link",
                className: "button button--primary",
                attrs: {
                    href: ctx.href("song-new", { bookId })
                },
                text: "Add song"
            }))
        }
        actions.appendChild(h("a", {
            id: "pdf-link",
            className: "button button--neutral",
            attrs: {
                href: ctx.href("pdfs", { bookId }),
                "aria-label": "PDF exports"
            },
            text: "PDF"
        }))

        if (accessLevel !== "admin") {
            return
        }

        const menu = ctx.registerMenu(createMenu({
            label: "⋯",
            accessibleName: "More book actions",
            buttonId: "book-menu-button",
            id: "book-menu",
            items: [
                {
                    kind: "link",
                    id: "share-link",
                    text: "Share",
                    href: ctx.href("share", { bookId })
                },
                {
                    kind: "button",
                    id: "rename-book-button",
                    text: "Rename",
                    action: "rename-book",
                    onSelect: () => renameBook()
                },
                {
                    kind: "button",
                    id: "delete-book-button",
                    text: "Delete song book",
                    action: "delete-book",
                    destructive: true,
                    onSelect: () => confirmDeleteBook()
                }
            ]
        }))
        actions.appendChild(menu.root)
    }

    async function renameBook() {
        const requestGeneration = ctx.session.state.generation
        let renamed = false
        const value = await ctx.dialogs.promptDialog({
            title: "Rename song book",
            label: "Name",
            value: bookName,
            maxLength: 100,
            required: true,
            confirmLabel: "Save",
            submit: async name => {
                if (!isRequestCurrent(requestGeneration)) {
                    return null
                }
                try {
                    await renameSongBook(bookId, { name })
                    if (!isRequestCurrent(requestGeneration)) {
                        return null
                    }
                    renamed = true
                    return null
                } catch (error) {
                    if (
                        error instanceof ApiError &&
                        [401, 403, 404].includes(error.status)
                    ) {
                        await ctx.handleError(error, mutationScope())
                        return null
                    }
                    if (!(error instanceof ApiError)) {
                        await ctx.handleError(error)
                        return "The song book could not be renamed. Try again."
                    }
                    return getSaveSongBookErrorMessage(error, "rename")
                }
            }
        })

        if (
            value === null ||
            !renamed ||
            !isRequestCurrent(requestGeneration)
        ) {
            return
        }

        invalidateSnapshot()
        loadedBook.name = value
        bookName = value
        heading.textContent = bookName
        ctx.setTitle([bookName])
        ctx.setBreadcrumb([{ text: bookName }])
        ctx.status.show("success", "Song book renamed.")
    }

    async function confirmDeleteBook() {
        const confirmed = await ctx.dialogs.confirmDialog({
            title: "Delete song book?",
            message: `Delete "${bookName}" and all of its songs and access entries? This cannot be undone.`,
            confirmLabel: "Delete song book",
            destructive: true
        })
        if (!confirmed || !ctx.isCurrent()) {
            return
        }

        try {
            await deleteSongBook(bookId)
        } catch (error) {
            if (
                error instanceof ApiError &&
                [401, 403, 404].includes(error.status)
            ) {
                await ctx.handleError(error, mutationScope())
                return
            }
            if (!(error instanceof ApiError)) {
                await ctx.handleError(error)
                return
            }
            ctx.status.show(
                "error",
                getDeleteSongBookErrorMessage(error)
            )
            return
        }

        if (!ctx.isCurrent()) {
            return
        }
        invalidateSnapshot()
        await ctx.goBackOr("/", { status: "Song book deleted." })
    }

    function invalidateSnapshot() {
        snapshotInvalidated = true
        ctx.cache.bookList = null
    }

    function mutationScope() {
        return {
            type: "mutation",
            bookId,
            signal: ctx.signal,
            path: ctx.router.current?.path,
            isCurrent: ctx.isCurrent,
            onBookUnavailable: invalidateSnapshot
        }
    }

    function isRequestCurrent(requestGeneration) {
        return ctx.isCurrent() &&
            ctx.session.state.generation === requestGeneration
    }

    function cleanup() {
        clearDebounce()
        if (loadedBook !== null && !snapshotInvalidated) {
            const snapshot = pagedList.snapshot()
            ctx.cache.bookList = snapshot.page === 0
                ? null
                : {
                    bookId,
                    q: activeSearch,
                    ...snapshot,
                    scrollY: window.scrollY
                }
        }
    }

    try {
        const book = await getSongBook(bookId, { signal: ctx.signal })
        if (!ctx.isCurrent()) {
            return {}
        }
        if (book === null || typeof book !== "object") {
            throw new TypeError("The API returned an invalid song book.")
        }

        setBookDetails(book)
        if (savedSnapshot !== null) {
            pagedList.restore(savedSnapshot)
        }
    } catch (error) {
        if (ctx.isCurrent()) {
            heading.textContent = "Song book"
            ctx.setTitle(["Song book"])
            ctx.setBreadcrumb([{ text: "Song book" }])
            await ctx.handleError(error, {
                type: "book",
                bookId,
                signal: ctx.signal,
                isCurrent: ctx.isCurrent,
                onBookUnavailable: invalidateSnapshot
            })
        }
        return { focusTarget: heading, cleanup }
    }

    await listLoad
    return {
        focusTarget: heading,
        cleanup
    }
}

function renderSongRow(song, ctx, bookId) {
    return h("li", {}, h("a", {
        className: "row-link song-row",
        attrs: {
            href: ctx.href("song", {
                bookId,
                songId: song.id
            }),
            "data-song-id": song.id
        }
    },
    h("span", {
        className: "song-row__number",
        text: displayValue(song.number)
    }),
    h("span", {
        className: "song-row__title",
        text: displayValue(song.title, "Untitled song")
    }),
    h("span", {
        className: "song-row__author",
        text: displayValue(song.author)
    })))
}

function renderEmptyState(search, accessLevel, ctx, bookId) {
    if (search !== "") {
        return h("span", {
            text: `No songs match "${search}".`
        })
    }

    const canAdd = accessLevel === "admin" || accessLevel === "editor"
    return h("span", {},
        "No songs yet.",
        canAdd
            ? h("span", {},
                " ",
                h("a", {
                    attrs: {
                        href: ctx.href("song-new", { bookId })
                    },
                    text: "Add the first song"
                }))
            : null
    )
}
