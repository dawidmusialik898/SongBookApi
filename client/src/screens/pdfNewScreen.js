import { ApiError } from "../httpClient.js"
import {
    createSongBookPdf,
    getSongBook
} from "../songBooksApi.js"
import { getSongs } from "../songsApi.js"
import { h, hasLostFocus } from "../ui/dom.js"
import {
    getGeneratePdfErrorMessage,
    getLoadSongsErrorMessage
} from "../ui/errors.js"
import { createPagedList } from "../ui/pagedList.js"
import {
    displayValue,
    normalizeAccessLevel
} from "../ui/format.js"
import { readPdfMetadata } from "../ui/pdf.js"

export async function renderPdfNewScreen(ctx) {
    const bookId = ctx.params.bookId
    let activeSearch = ""
    let debounceTimer = null
    let songsLoaded = false
    let isGenerating = false
    const selectedSongs = new Map()

    ctx.setTitle(["New PDF"])
    ctx.setBreadcrumb([{ text: "New PDF" }])

    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "New PDF"
    })
    const stateElement = h("p", {
        id: "pdf-new-state",
        className: "list-state",
        text: "Loading song book…"
    })
    const wholeBookRadio = h("input", {
        id: "pdf-scope-whole",
        type: "radio",
        attrs: {
            name: "scope",
            value: "whole",
            checked: true
        }
    })
    const selectedSongsRadio = h("input", {
        id: "pdf-scope-selected",
        type: "radio",
        attrs: {
            name: "scope",
            value: "selected"
        }
    })
    const includeChords = h("input", {
        id: "pdf-include-chords",
        type: "checkbox",
        attrs: { checked: true }
    })
    const songSearchInput = h("input", {
        id: "pdf-song-search",
        type: "search",
        attrs: {
            maxlength: "100",
            placeholder: "Title, author or number"
        }
    })
    const songSearchForm = h("form", {
        id: "pdf-song-search-form",
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
        attrs: { for: "pdf-song-search" },
        text: "Search songs"
    }),
    songSearchInput)
    const songList = h("ul", {
        id: "pdf-song-list",
        className: "pdf-song-list"
    })
    const songListState = h("p", {
        id: "pdf-song-list-state",
        className: "list-state",
        text: "Choose songs to load the song list."
    })
    const selectionCount = h("p", {
        id: "pdf-selection-count",
        attrs: { role: "status" },
        text: "No songs selected"
    })
    const moreSongsButton = h("button", {
        id: "show-more-pdf-songs",
        className: "button button--neutral",
        type: "button",
        attrs: { "aria-label": "Show more PDF songs" },
        hidden: true,
        disabled: true,
        text: "Show more"
    })
    const songPicker = h("section", {
        id: "pdf-song-picker",
        className: "pdf-song-picker",
        hidden: true
    },
    songSearchForm,
    songList,
    songListState,
    moreSongsButton,
    selectionCount)
    const formError = h("p", {
        id: "pdf-form-error",
        className: "form-error",
        attrs: { role: "alert" },
        hidden: true
    })
    const createButton = h("button", {
        id: "create-pdf-button",
        className: "button button--primary",
        type: "submit",
        disabled: true,
        text: "Create PDF"
    })
    const pdfForm = h("form", {
        id: "pdf-form",
        className: "pdf-form",
        hidden: true,
        on: { submit: event => submitPdf(event) }
    },
    h("fieldset", {},
        h("legend", { text: "Songs" }),
        h("div", { className: "pdf-scope-options" },
            h("label", { className: "pdf-scope-option" },
                wholeBookRadio,
                h("span", { text: "Entire book" })),
            h("label", { className: "pdf-scope-option" },
                selectedSongsRadio,
                h("span", { text: "Choose songs" })))),
    songPicker,
    h("label", { className: "checkbox-field" },
        includeChords,
        h("span", { text: "Include chords" })),
    formError,
    h("div", { className: "pdf-form__actions" },
        h("a", {
            id: "cancel-pdf-link",
            className: "button button--neutral",
            attrs: { href: ctx.href("pdfs", { bookId }) },
            text: "Cancel"
        }),
        createButton))
    ctx.root.replaceChildren(heading, stateElement, pdfForm)

    const pagedList = createPagedList({
        list: songList,
        stateElement: songListState,
        moreButton: moreSongsButton,
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
                    await ctx.handleError(error, bookScope())
                }
                throw error
            }
        },
        renderItem: renderSongOption,
        getKey: song => song.id,
        messages: {
            loading: "Loading songs…",
            empty: "No songs yet.",
            error: error => getLoadSongsErrorMessage(error)
        },
        signal: ctx.signal
    })

    wholeBookRadio.addEventListener("change", updateScope)
    selectedSongsRadio.addEventListener("change", updateScope)
    songSearchInput.addEventListener("input", () => {
        clearDebounce()
        debounceTimer = setTimeout(() => {
            debounceTimer = null
            void searchNow()
        }, 300)
    })

    try {
        const book = await getSongBook(bookId, { signal: ctx.signal })
        if (!ctx.isCurrent()) {
            return { focusTarget: heading, cleanup: clearDebounce }
        }
        if (book === null || typeof book !== "object") {
            throw new TypeError("The API returned an invalid song book.")
        }

        if (normalizeAccessLevel(book.accessLevel) !== "admin") {
            await ctx.navigate(ctx.href("pdfs", { bookId }), {
                replace: true,
                status: {
                    type: "error",
                    message: "Only the owner can create PDFs."
                }
            })
            return { focusTarget: heading, cleanup: clearDebounce }
        }

        const bookName = displayValue(book.name, "Untitled song book")
        ctx.setTitle(["New PDF", bookName])
        ctx.setBreadcrumb([
            {
                text: bookName,
                href: ctx.href("book", { bookId })
            },
            {
                text: "PDF exports",
                href: ctx.href("pdfs", { bookId })
            },
            { text: "New PDF" }
        ])
        stateElement.hidden = true
        pdfForm.hidden = false
        createButton.disabled = false
    } catch (error) {
        if (ctx.isCurrent()) {
            stateElement.replaceChildren()
            await ctx.handleError(error, {
                type: "book",
                bookId,
                signal: ctx.signal,
                isCurrent: ctx.isCurrent
            })
        }
        return { focusTarget: heading, cleanup: clearDebounce }
    }

    return {
        focusTarget: heading,
        cleanup: clearDebounce
    }

    function renderSongOption(song) {
        const title = displayValue(song.title, "Untitled song")
        const number = displayValue(song.number)
        const checkbox = h("input", {
            type: "checkbox",
            dataset: { songId: song.id },
            on: {
                change: event => updateSelection(
                    song,
                    event.currentTarget.checked
                )
            }
        })
        checkbox.checked = selectedSongs.has(song.id)
        return h("li", {},
            h("label", { className: "pdf-song-option" },
                checkbox,
                number === ""
                    ? null
                    : h("span", {
                        className: "pdf-song-option__number",
                        text: number
                    }),
                h("span", {
                    className: "pdf-song-option__title",
                    text: title
                })))
    }

    function updateSelection(song, selected) {
        if (selected) {
            selectedSongs.set(
                song.id,
                displayValue(song.title, "Untitled song")
            )
        } else {
            selectedSongs.delete(song.id)
        }
        renderSelectionCount()
        clearFormError()
    }

    function renderSelectionCount() {
        const count = selectedSongs.size
        selectionCount.textContent = count === 0
            ? "No songs selected"
            : `${count} song${count === 1 ? "" : "s"} selected`
    }

    function updateScope() {
        clearDebounce()
        const choosingSongs = selectedSongsRadio.checked
        songPicker.hidden = !choosingSongs
        clearFormError()
        if (choosingSongs && !songsLoaded) {
            songsLoaded = true
            void pagedList.reload()
        }
    }

    async function searchNow() {
        if (
            !ctx.isCurrent() ||
            !selectedSongsRadio.checked
        ) {
            return
        }
        const search = songSearchInput.value.trim()
        if (search === activeSearch) {
            return
        }
        activeSearch = search
        await pagedList.reload()
    }

    async function submitPdf(event) {
        event.preventDefault()
        if (!ctx.isCurrent() || isGenerating) {
            return
        }

        const choosingSongs = selectedSongsRadio.checked
        if (choosingSongs && selectedSongs.size === 0) {
            formError.textContent = "Choose at least one song."
            formError.hidden = false
            return
        }
        clearFormError()

        const payload = {
            includeChords: includeChords.checked,
            ...(choosingSongs
                ? { songIds: [...selectedSongs.keys()] }
                : {})
        }
        const sessionGeneration = ctx.session.state.generation
        isGenerating = true
        createButton.disabled = true
        try {
            readPdfMetadata(await createSongBookPdf(bookId, payload))
            if (!isRequestCurrent(sessionGeneration)) {
                return
            }
            await ctx.goBackOr(ctx.href("pdfs", { bookId }), {
                status: "PDF created."
            })
        } catch (error) {
            if (
                !isRequestCurrent(sessionGeneration) ||
                error?.name === "AbortError"
            ) {
                return
            }
            if (
                error instanceof ApiError &&
                [401, 403, 404].includes(error.status)
            ) {
                await ctx.handleError(error, {
                    type: "mutation",
                    bookId,
                    signal: ctx.signal,
                    path: ctx.router.current?.path,
                    isCurrent: ctx.isCurrent
                })
                return
            }
            if (!(error instanceof ApiError)) {
                console.error(error)
            }
            ctx.status.show("error", getGeneratePdfErrorMessage(error))
        } finally {
            isGenerating = false
            createButton.disabled = !ctx.isCurrent()
            if (ctx.isCurrent() && hasLostFocus()) {
                createButton.focus()
            }
        }
    }

    function clearFormError() {
        formError.textContent = ""
        formError.hidden = true
    }

    function clearDebounce() {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer)
            debounceTimer = null
        }
    }

    function isRequestCurrent(sessionGeneration) {
        return ctx.isCurrent() &&
            ctx.session.state.generation === sessionGeneration
    }

    function bookScope() {
        return {
            type: "book",
            bookId,
            signal: ctx.signal,
            isCurrent: ctx.isCurrent
        }
    }
}
