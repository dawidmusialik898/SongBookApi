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
import { pdfOptionErrors, readPdfMetadata } from "../ui/pdf.js"

export async function renderPdfNewScreen(ctx) {
    const bookId = ctx.params.bookId
    let activeSearch = ""
    let debounceTimer = null
    let songsLoaded = false
    let isGenerating = false
    const selectedSongs = new Map()
    const songCheckboxes = new Set()

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
    const fontFamily = select("pdf-font-family", [
        ["lato", "Lato"], ["dejavu-sans-mono", "DejaVu Sans Mono"]
    ], "lato")
    const fontSize = h("input", {
        id: "pdf-font-size", type: "number",
        attrs: { min: "8", max: "18", step: "1", required: true, value: "10" }
    })
    const orientation = select("pdf-orientation", [
        ["portrait", "Portrait"], ["landscape", "Landscape"]
    ], "portrait")
    const columns = select("pdf-columns", [
        ["1", "1"], ["2", "2"], ["3", "3"]
    ], "1")
    columns.children[2].disabled = true
    orientation.addEventListener("change", () => {
        const landscape = orientation.value === "landscape"
        columns.children[2].disabled = !landscape
        if (landscape) {
            columns.value = "2"
        } else if (Number(columns.value) > 2) {
            columns.value = "1"
        }
        clearFormError()
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
    const songPicker = h("fieldset", {
        id: "pdf-song-picker",
        className: "pdf-song-picker",
        hidden: true
    },
    h("legend", { text: "Selected songs" }),
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
    h("fieldset", {},
        h("legend", { text: "Typography and layout" }),
        field("Font family", fontFamily),
        field("Font size (pt)", fontSize),
        field("Orientation", orientation),
        field("Columns", columns),
        h("p", {
            id: "pdf-chord-font-help",
            text: "Chorded lyrics always use bundled DejaVu Sans Mono for accurate chord alignment. Font size scales the 9 pt chord grid proportionally."
        })),
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
        checkbox.disabled = isGenerating
        songCheckboxes.add(checkbox)
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
        if (isGenerating) {
            return
        }
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
        if (isGenerating) {
            return
        }
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
            isGenerating ||
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
        const options = {
            fontFamily: fontFamily.value,
            fontSize: Number(fontSize.value),
            orientation: orientation.value,
            columns: Number(columns.value)
        }
        const optionErrors = pdfOptionErrors(options)
        if (Object.keys(optionErrors).length !== 0) {
            formError.textContent = Object.values(optionErrors).join(" ")
            formError.hidden = false
            return
        }
        clearFormError()

        const payload = {
            includeChords: includeChords.checked,
            ...options,
            ...(choosingSongs
                ? { songIds: [...selectedSongs.keys()] }
                : {})
        }
        const sessionGeneration = ctx.session.state.generation
        clearDebounce()
        isGenerating = true
        setBusy(true)
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
            setBusy(false)
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

    function setBusy(busy) {
        for (const control of [
            wholeBookRadio, selectedSongsRadio, includeChords, fontFamily,
            fontSize, orientation, columns, songSearchInput, createButton,
            songPicker,
            ...songCheckboxes
        ]) {
            control.disabled = busy
        }
        moreSongsButton.disabled = busy || !pagedList.snapshot().hasNext
        pdfForm.setAttribute("aria-busy", String(busy))
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

    function select(id, values, initial) {
        const control = h("select", { id }, ...values.map(([value, text]) =>
            h("option", { attrs: { value }, text })))
        control.value = initial
        return control
    }

    function field(text, control) {
        return h("div", { className: "form-field" },
            h("label", { attrs: { for: control.id }, text }), control)
    }
}
