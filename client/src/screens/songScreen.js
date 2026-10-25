import { ApiError } from "../httpClient.js"
import { deleteSong, getAdjacentSongs, getSong } from "../songsApi.js"
import { getSongBook } from "../songBooksApi.js"
import { renderChordedText } from "../chords.js"
import { h } from "../ui/dom.js"
import {
    getDeleteSongErrorMessage
} from "../ui/errors.js"
import { createMenu } from "../ui/menu.js"
import {
    displayValue,
    normalizeAccessLevel
} from "../ui/format.js"

export async function renderSongScreen(ctx) {
    const { bookId, songId } = ctx.params
    ctx.setBreadcrumb([])
    ctx.setTitle(["Song"])
    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "Loading…"
    })
    const header = h("header", {
        className: "screen-header"
    }, heading)
    const meta = h("p", {
        id: "song-meta",
        className: "song-meta"
    })
    const originalTitle = h("p", {
        id: "song-meta-original",
        className: "song-meta-original",
        hidden: true
    })
    const actions = h("div", {
        className: "screen-actions song-actions"
    })
    const parts = h("div", { id: "song-parts" })
    const pagerContainer = h("div", { id: "song-pager-container" })
    ctx.root.replaceChildren(
        header,
        meta,
        originalTitle,
        actions,
        parts,
        pagerContainer
    )

    const bookRequest = getSongBook(bookId, { signal: ctx.signal })
        .then(value => ({ value }), error => ({ error }))
    const songRequest = getSong(bookId, songId, { signal: ctx.signal })
        .then(value => ({ value }), error => ({ error }))
    const adjacentRequest = getAdjacentSongs(bookId, songId, {
        signal: ctx.signal
    }).then(value => ({ value }), error => ({ error }))

    const [bookResult, songResult, adjacentResult] = await Promise.all([
        bookRequest,
        songRequest,
        adjacentRequest
    ])
    if (!ctx.isCurrent()) {
        return {}
    }

    if (bookResult.error !== undefined) {
        heading.textContent = "Song"
        ctx.setTitle(["Song"])
        ctx.setBreadcrumb([{ text: "Song" }])
        await ctx.handleError(bookResult.error, {
            type: "book",
            bookId,
            signal: ctx.signal,
            isCurrent: ctx.isCurrent
        })
        return { focusTarget: heading }
    }
    if (songResult.error !== undefined) {
        heading.textContent = "Song"
        const book = bookResult.value
        if (book !== null && typeof book === "object") {
            const bookName = displayValue(book.name, "Untitled song book")
            ctx.setTitle(["Song", bookName])
            ctx.setBreadcrumb([
                {
                    text: bookName,
                    href: ctx.href("book", { bookId })
                },
                { text: "Song" }
            ])
        } else {
            ctx.setTitle(["Song"])
            ctx.setBreadcrumb([{ text: "Song" }])
        }
        await ctx.handleError(songResult.error, {
            type: "song",
            bookId,
            songId,
            signal: ctx.signal,
            isCurrent: ctx.isCurrent
        })
        return { focusTarget: heading }
    }

    const book = bookResult.value
    const song = songResult.value
    if (
        book === null ||
        typeof book !== "object" ||
        song === null ||
        typeof song !== "object" ||
        !Array.isArray(song.parts)
    ) {
        await ctx.handleError(
            new TypeError("The API returned invalid song details."),
            "programmer"
        )
        return { focusTarget: heading }
    }

    const bookName = displayValue(book.name, "Untitled song book")
    const songName = displayValue(song.title, "Untitled song")
    const accessLevel = normalizeAccessLevel(book.accessLevel)
    const canEdit = accessLevel === "admin" || accessLevel === "editor"
    heading.textContent = songName
    ctx.setTitle([songName, bookName])
    ctx.setBreadcrumb([
        {
            text: bookName,
            href: ctx.href("book", { bookId })
        },
        { text: songName }
    ])

    const metaParts = []
    if (hasDisplayValue(song.author)) {
        metaParts.push(String(song.author))
    }
    if (hasDisplayValue(song.key)) {
        metaParts.push(`Key ${song.key}`)
    }
    if (hasDisplayValue(song.tempo)) {
        metaParts.push(String(song.tempo))
    }
    if (hasDisplayValue(song.number)) {
        metaParts.push(`No. ${song.number}`)
    }
    meta.textContent = metaParts.join(" · ")
    if (hasDisplayValue(song.originalTitle)) {
        originalTitle.hidden = false
        originalTitle.textContent = `Original title: ${song.originalTitle}`
    }

    const hasChords = song.parts.some(part =>
        Array.isArray(part.chords) && part.chords.length > 0
    )
    let chordsToggle = null
    if (hasChords) {
        chordsToggle = h("button", {
            id: "chords-toggle",
            className: "button button--neutral",
            type: "button",
            attrs: {
                "aria-pressed": String(ctx.prefs.showChords)
            },
            text: "Chords",
            on: {
                click: () => {
                    ctx.prefs.showChords = !ctx.prefs.showChords
                    chordsToggle.setAttribute(
                        "aria-pressed",
                        String(ctx.prefs.showChords)
                    )
                    renderParts()
                }
            }
        })
        actions.appendChild(chordsToggle)
    }
    if (canEdit) {
        actions.appendChild(h("a", {
            id: "edit-song-link",
            className: "button button--primary",
            attrs: {
                href: ctx.href("song-edit", { bookId, songId })
            },
            text: "Edit"
        }))
        const menu = ctx.registerMenu(createMenu({
            label: "⋯",
            accessibleName: "More song actions",
            buttonId: "song-menu-button",
            id: "song-menu",
            items: [{
                kind: "button",
                id: "delete-song-button",
                text: "Delete song",
                action: "delete-song",
                destructive: true,
                onSelect: () => confirmDeleteSong()
            }]
        }))
        actions.appendChild(menu.root)
    }

    renderParts()
    const adjacent = adjacentResult.error === undefined
        ? adjacentResult.value
        : null
    if (
        adjacentResult.error instanceof ApiError &&
        adjacentResult.error.status === 401
    ) {
        await ctx.handleError(adjacentResult.error, {
            type: "adjacent",
            bookId,
            signal: ctx.signal,
            isCurrent: ctx.isCurrent
        })
        return { focusTarget: heading }
    }
    renderPager(adjacent)

    async function confirmDeleteSong() {
        const confirmed = await ctx.dialogs.confirmDialog({
            title: "Delete song?",
            message: `Delete "${songName}"? This cannot be undone.`,
            confirmLabel: "Delete song",
            destructive: true
        })
        if (!confirmed || !ctx.isCurrent()) {
            return
        }

        try {
            await deleteSong(bookId, songId)
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
                ctx.cache.bookList = null
                await ctx.goBackOr(ctx.href("book", { bookId }), {
                    status: {
                        type: "error",
                        message: "This song was already deleted."
                    }
                })
                return
            }
            if (
                error instanceof ApiError &&
                [401, 403].includes(error.status)
            ) {
                await ctx.handleError(error, mutationScope())
                return
            }
            if (!(error instanceof ApiError)) {
                await ctx.handleError(error)
                return
            }
            ctx.status.show("error", getDeleteSongErrorMessage(error))
            return
        }

        if (!ctx.isCurrent()) {
            return
        }
        ctx.cache.bookList = null
        await ctx.goBackOr(ctx.href("book", { bookId }), {
            status: "Song deleted."
        })
    }

    function mutationScope() {
        return {
            type: "mutation",
            bookId,
            signal: ctx.signal,
            path: ctx.router.current?.path,
            isCurrent: ctx.isCurrent
        }
    }

    function renderParts() {
        parts.replaceChildren()
        if (song.parts.length === 0) {
            parts.appendChild(h("p", {
                text: "This song has no lyrics yet."
            }))
            return
        }

        for (const part of song.parts) {
            const section = h("section", {
                className: "song-part"
            })
            if (hasDisplayValue(part.name)) {
                section.appendChild(h("h2", {
                    className: "song-part__name",
                    text: part.name
                }))
            }

            const text = typeof part.text === "string" ? part.text : ""
            const chords = Array.isArray(part.chords) ? part.chords : []
            if (ctx.prefs.showChords && chords.length > 0) {
                const chordedText = h("div", {
                    className: "chorded-text"
                })
                renderChordedText(chordedText, text, chords)
                section.appendChild(chordedText)
            } else {
                section.appendChild(h("p", {
                    className: "song-part__text",
                    text
                }))
            }
            parts.appendChild(section)
        }
    }

    function renderPager(value) {
        pagerContainer.replaceChildren()
        if (
            value === null ||
            typeof value !== "object" ||
            (value.previous == null && value.next == null)
        ) {
            return
        }

        const previous = value.previous ?? null
        const next = value.next ?? null
        const pager = h("nav", {
            id: "song-pager",
            className: previous === null
                ? "song-pager--next-only"
                : next === null
                    ? "song-pager--previous-only"
                    : "",
            attrs: { "aria-label": "Song navigation" }
        })
        if (previous !== null) {
            pager.appendChild(createPagerLink(
                previous,
                "previous",
                ctx,
                bookId
            ))
        }
        if (next !== null) {
            pager.appendChild(createPagerLink(
                next,
                "next",
                ctx,
                bookId
            ))
        }
        pagerContainer.appendChild(pager)
    }

    return {
        focusTarget: heading,
        onKeydown(event) {
            if (
                !["ArrowLeft", "ArrowRight"].includes(event.key) ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                ctx.elements.dialog.open ||
                ctx.shell.hasOpenMenu() ||
                isTextInput(event.target) ||
                isTextInput(document.activeElement)
            ) {
                return
            }
            const side = event.key === "ArrowLeft"
                ? "previous"
                : "next"
            const destination = side === "previous"
                ? adjacent?.previous
                : adjacent?.next
            if (destination == null) {
                return
            }
            event.preventDefault()
            return ctx.navigate(
                ctx.href("song", {
                    bookId,
                    songId: destination.id
                }),
                { replace: true }
            )
        }
    }
}

function createPagerLink(song, side, ctx, bookId) {
    const title = displayValue(song.title, "Untitled song")
    const link = h("a", {
        className: `song-pager__link song-pager__link--${side}`,
        attrs: {
            href: ctx.href("song", {
                bookId,
                songId: song.id
            }),
            "aria-label": side === "previous"
                ? `Previous song: ${title}`
                : `Next song: ${title}`,
            "data-song-id": song.id
        },
        text: side === "previous"
            ? `‹ ${title}`
            : `${title} ›`,
        on: {
            click: event => {
                if (
                    (
                        event.button !== undefined &&
                        event.button !== 0
                    ) ||
                    event.altKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey
                ) {
                    return
                }
                event.preventDefault()
                return ctx.navigate(
                    ctx.href("song", {
                        bookId,
                        songId: song.id
                    }),
                    { replace: true }
                )
            }
        }
    })
    return link
}

function isTextInput(element) {
    return ["INPUT", "TEXTAREA", "SELECT"].includes(element?.tagName)
}

function hasDisplayValue(value) {
    return value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
}
