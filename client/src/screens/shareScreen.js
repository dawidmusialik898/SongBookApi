import { ApiError } from "../httpClient.js"
import { readPage } from "../pagination.js"
import {
    getSongBook,
    getSongBookAccess,
    removeSongBookAccess,
    setSongBookAccess
} from "../songBooksApi.js"
import { findActionTarget, h } from "../ui/dom.js"
import {
    getLoadCollaboratorsErrorMessage,
    getSongBookAccessErrorMessage
} from "../ui/errors.js"
import { displayValue, normalizeAccessLevel } from "../ui/format.js"
import { createPagedList } from "../ui/pagedList.js"

const COLLABORATOR_ACCESS_LEVELS = new Set(["reader", "editor"])

export async function renderShareScreen(ctx) {
    const bookId = ctx.params.bookId
    let isMutating = false
    let isInitialLoad = true
    let initialAccessError = null
    const rowControls = new Map()

    ctx.setTitle(["Share"])
    ctx.setBreadcrumb([{ text: "Share" }])

    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "Share"
    })
    const intro = h("p", {
        id: "share-intro",
        className: "share-intro",
        text: "Readers can view songs and download PDFs. Editors can also add, edit, and delete songs."
    })
    const emailInput = h("input", {
        id: "share-email",
        type: "email",
        disabled: true,
        attrs: {
            autocomplete: "off",
            required: true
        }
    })
    const emailField = h("div", {
        className: "form-field"
    },
    h("label", {
        attrs: { for: "share-email" },
        text: "Email of a registered user"
    }),
    emailInput)
    const accessSelect = h("select", {
        id: "share-access-level",
        disabled: true,
        attrs: { "aria-label": "Access" }
    },
    h("option", {
        attrs: { value: "reader" },
        text: "Reader"
    }),
    h("option", {
        attrs: { value: "editor" },
        text: "Editor"
    }))
    accessSelect.value = "reader"
    const accessField = h("div", {
        className: "form-field"
    },
    h("label", {
        attrs: { for: "share-access-level" },
        text: "Access"
    }),
    accessSelect)
    const submitButton = h("button", {
        id: "share-submit",
        className: "button button--primary",
        type: "submit",
        disabled: true,
        text: "Add"
    })
    const formError = h("p", {
        id: "share-form-error",
        className: "form-error",
        attrs: { role: "alert" },
        hidden: true
    })
    const shareForm = h("form", {
        id: "share-form",
        className: "share-form",
        hidden: true,
        on: { submit: event => addCollaborator(event) }
    },
    emailField,
    accessField,
    submitButton,
    formError)
    const collaboratorList = h("ul", {
        id: "collaborator-list",
        className: "row-list collaborator-list",
        hidden: true
    })
    const listState = h("p", {
        id: "collaborator-list-state",
        className: "list-state",
        text: "Loading collaborators…"
    })
    const moreButton = h("button", {
        id: "show-more-collaborators",
        className: "button button--neutral",
        type: "button",
        attrs: { "aria-label": "Show more collaborators" },
        hidden: true,
        disabled: true,
        text: "Show more"
    })
    ctx.root.replaceChildren(
        heading,
        intro,
        shareForm,
        collaboratorList,
        listState,
        moreButton
    )

    const pagedList = createPagedList({
        list: collaboratorList,
        stateElement: listState,
        moreButton,
        fetchPage: async (page, signal) => {
            try {
                const result = await getSongBookAccess(
                    bookId,
                    page,
                    { signal }
                )
                return {
                    ...readPage(result, page),
                    items: result.items.map(readCollaborator)
                }
            } catch (error) {
                if (isInitialLoad) {
                    initialAccessError = error
                } else {
                    await handleCollaboratorLoadError(error)
                }
                if (
                    error?.name !== "AbortError" &&
                    !(error instanceof ApiError)
                ) {
                    console.error(error)
                }
                throw error
            }
        },
        renderItem: renderCollaborator,
        getKey: collaborator => collaborator.id,
        messages: {
            loading: "Loading collaborators…",
            empty: () => h("span", {
                text: "Not shared with anyone yet."
            }),
            error: error => getLoadCollaboratorsErrorMessage(error)
        },
        signal: ctx.signal
    })

    collaboratorList.addEventListener("change", event =>
        handleCollaboratorChange(event)
    )
    collaboratorList.addEventListener("click", event =>
        handleCollaboratorClick(event)
    )

    const [bookResult] = await Promise.allSettled([
        getSongBook(bookId, { signal: ctx.signal }),
        pagedList.reload()
    ])
    isInitialLoad = false
    if (!ctx.isCurrent()) {
        return { focusTarget: heading }
    }
    if (initialAccessError?.status === 401) {
        await ctx.handleError(initialAccessError)
        return { focusTarget: heading }
    }
    if (bookResult.status === "rejected") {
        listState.replaceChildren()
        await ctx.handleError(bookResult.reason, bookScope())
        return { focusTarget: heading }
    }

    const book = bookResult.value
    if (book === null || typeof book !== "object") {
        listState.replaceChildren()
        await ctx.handleError(
            new TypeError("The API returned an invalid song book.")
        )
        return { focusTarget: heading }
    }
    const accessLevel = normalizeAccessLevel(book.accessLevel)
    if (accessLevel !== "admin") {
        await redirectNonOwner()
        return { focusTarget: heading }
    }

    const bookName = displayValue(book.name, "Untitled song book")
    ctx.setTitle(["Share", bookName])
    ctx.setBreadcrumb([
        {
            text: bookName,
            href: ctx.href("book", { bookId })
        },
        { text: "Share" }
    ])
    shareForm.hidden = false
    collaboratorList.hidden = false
    setMutationBusy(false)

    if (initialAccessError !== null) {
        await handleCollaboratorLoadError(initialAccessError)
    }

    return { focusTarget: heading }

    function renderCollaborator(value) {
        const collaborator = readCollaborator(value)
        const accessSelectId =
            `collaborator-access-${collaborator.id}`
        const accessSelectForRow = h("select", {
            id: accessSelectId,
            dataset: {
                action: "change-access",
                accessId: collaborator.id
            },
            disabled: isMutating
        },
        h("option", {
            attrs: { value: "reader" },
            text: "Reader"
        }),
        h("option", {
            attrs: { value: "editor" },
            text: "Editor"
        }))
        accessSelectForRow.value = collaborator.accessLevel
        const removeButton = h("button", {
            className: "button button--neutral",
            type: "button",
            dataset: {
                action: "remove-access",
                accessId: collaborator.id
            },
            attrs: {
                "aria-label": `Remove ${collaborator.email}`
            },
            disabled: isMutating,
            text: "Remove"
        })
        rowControls.set(collaborator.id, {
            accessSelect: accessSelectForRow,
            removeButton
        })

        return h("li", {
            className: "collaborator-item",
            dataset: { accessId: collaborator.id }
        },
        h("span", {
            className: "collaborator-item__email",
            text: collaborator.email
        }),
        h("div", {
            className: "collaborator-item__actions"
        },
        h("label", {
            className: "visually-hidden",
            attrs: { for: accessSelectId },
            text: `Access for ${collaborator.email}`
        }),
        accessSelectForRow,
        removeButton))
    }

    async function addCollaborator(event) {
        event.preventDefault()
        if (!ctx.isCurrent() || isMutating) {
            return
        }
        if (!shareForm.checkValidity()) {
            shareForm.reportValidity()
            return
        }

        const payload = {
            email: emailInput.value.trim(),
            accessLevel: accessSelect.value
        }
        if (!COLLABORATOR_ACCESS_LEVELS.has(payload.accessLevel)) {
            shareForm.reportValidity()
            return
        }

        const sessionGeneration = ctx.session.state.generation
        clearFormError()
        setMutationBusy(true)
        let shouldFocusEmail = false
        try {
            const saved = readCollaborator(
                await setSongBookAccess(bookId, payload)
            )
            if (!isRequestCurrent(sessionGeneration)) {
                return
            }

            upsertCollaborator(saved)
            emailInput.value = ""
            accessSelect.value = "reader"
            ctx.status.show("success", "Access saved.")
            shouldFocusEmail = true
        } catch (error) {
            if (
                !isRequestCurrent(sessionGeneration) ||
                error?.name === "AbortError"
            ) {
                return
            }
            await handleMutationError(error, "add")
        } finally {
            if (isRequestCurrent(sessionGeneration)) {
                setMutationBusy(false)
                if (shouldFocusEmail) {
                    emailInput.focus()
                }
            }
        }
    }

    async function handleCollaboratorChange(event) {
        const select = findActionTarget(event.target, collaboratorList)
        if (
            select === null ||
            select.dataset.action !== "change-access" ||
            !ctx.isCurrent() ||
            isMutating
        ) {
            return
        }
        const accessId = select.dataset.accessId
        const collaborator = pagedList.items().find(
            item => item.id === accessId
        )
        if (collaborator === undefined) {
            return
        }

        const previousAccessLevel = collaborator.accessLevel
        const nextAccessLevel = select.value
        if (
            !COLLABORATOR_ACCESS_LEVELS.has(nextAccessLevel) ||
            nextAccessLevel === previousAccessLevel
        ) {
            select.value = previousAccessLevel
            return
        }

        const sessionGeneration = ctx.session.state.generation
        setMutationBusy(true)
        try {
            const updated = readCollaborator(
                await setSongBookAccess(bookId, {
                    email: collaborator.email,
                    accessLevel: nextAccessLevel
                })
            )
            if (!isRequestCurrent(sessionGeneration)) {
                return
            }
            upsertCollaborator(updated)
            ctx.status.show("success", "Access updated.")
        } catch (error) {
            select.value = previousAccessLevel
            if (
                !isRequestCurrent(sessionGeneration) ||
                error?.name === "AbortError"
            ) {
                return
            }
            await handleMutationError(error, "update")
        } finally {
            if (isRequestCurrent(sessionGeneration)) {
                setMutationBusy(false)
            }
        }
    }

    async function handleCollaboratorClick(event) {
        const button = findActionTarget(event.target, collaboratorList)
        if (
            button === null ||
            button.dataset.action !== "remove-access" ||
            !ctx.isCurrent() ||
            isMutating
        ) {
            return
        }
        await removeCollaborator(button.dataset.accessId)
    }

    async function removeCollaborator(accessId) {
        const collaborator = pagedList.items().find(
            item => item.id === accessId
        )
        if (collaborator === undefined) {
            return
        }
        const confirmed = await ctx.dialogs.confirmDialog({
            title: "Remove access?",
            message: `Remove access for "${collaborator.email}"?`,
            confirmLabel: "Remove",
            destructive: true
        })
        if (!confirmed || !ctx.isCurrent()) {
            return
        }

        const sessionGeneration = ctx.session.state.generation
        setMutationBusy(true)
        let shouldFocusEmail = false
        try {
            await removeSongBookAccess(bookId, collaborator.id)
            if (!isRequestCurrent(sessionGeneration)) {
                return
            }
            removeCollaboratorFromList(collaborator.id)
            ctx.status.show("success", "Access removed.")
            shouldFocusEmail = true
        } catch (error) {
            if (
                !isRequestCurrent(sessionGeneration) ||
                error?.name === "AbortError"
            ) {
                return
            }
            await handleMutationError(error, "remove", collaborator.id)
        } finally {
            if (isRequestCurrent(sessionGeneration)) {
                setMutationBusy(false)
                if (shouldFocusEmail) {
                    emailInput.focus()
                }
            }
        }
    }

    async function handleCollaboratorLoadError(error) {
        if (!ctx.isCurrent() || error?.name === "AbortError") {
            return
        }
        if (error instanceof ApiError && error.status === 401) {
            await ctx.handleError(error)
            return
        }
        if (error instanceof ApiError && [403, 404].includes(error.status)) {
            const isOwner = await refreshOwnerRole()
            if (!isOwner || !ctx.isCurrent()) {
                return
            }
        }
    }

    async function handleMutationError(error, action, accessId = null) {
        if (error instanceof ApiError && error.status === 401) {
            await ctx.handleError(error)
            return
        }
        if (error instanceof ApiError && error.status === 403) {
            await ctx.handleError(error, {
                type: "mutation",
                bookId,
                signal: ctx.signal,
                path: ctx.router.current?.path,
                isCurrent: ctx.isCurrent
            })
            return
        }
        if (error instanceof ApiError && error.status === 404) {
            const isOwner = await refreshOwnerRole()
            if (!isOwner || !ctx.isCurrent()) {
                return
            }
            if (action === "add") {
                showFormError(
                    "No registered account was found for that email."
                )
                return
            }
            if (action === "remove") {
                removeCollaboratorFromList(accessId)
                ctx.status.show(
                    "info",
                    "That collaborator entry was already removed."
                )
                return
            }
        }
        if (!(error instanceof ApiError)) {
            console.error(error)
        }
        if (action === "add") {
            showFormError(getSongBookAccessErrorMessage(error))
        } else {
            ctx.status.show(
                "error",
                getSongBookAccessErrorMessage(error)
            )
        }
    }

    async function refreshOwnerRole() {
        let refreshedBook
        try {
            refreshedBook = await getSongBook(bookId, {
                signal: ctx.signal
            })
        } catch (error) {
            if (
                error?.name === "AbortError" ||
                !ctx.isCurrent()
            ) {
                return false
            }
            await ctx.handleError(error, bookScope())
            return false
        }
        if (!ctx.isCurrent()) {
            return false
        }
        if (
            refreshedBook === null ||
            typeof refreshedBook !== "object"
        ) {
            await ctx.handleError(
                new TypeError("The API returned an invalid song book.")
            )
            return false
        }
        if (
            normalizeAccessLevel(refreshedBook.accessLevel) !== "admin"
        ) {
            await redirectNonOwner()
            return false
        }
        return true
    }

    async function redirectNonOwner() {
        await ctx.navigate(ctx.href("book", { bookId }), {
            replace: true,
            status: {
                type: "error",
                message: "Only the owner can manage sharing."
            }
        })
    }

    function upsertCollaborator(collaborator) {
        const snapshot = pagedList.snapshot()
        if (snapshot.page === 0) {
            void pagedList.reload()
            return
        }
        const items = [...snapshot.items]
        const existingIndex = items.findIndex(item =>
            item.id === collaborator.id ||
            item.email.toLowerCase() === collaborator.email.toLowerCase()
        )
        if (existingIndex === -1) {
            items.unshift(collaborator)
        } else {
            items[existingIndex] = collaborator
        }
        restoreList({ ...snapshot, items })
    }

    function removeCollaboratorFromList(accessId) {
        const snapshot = pagedList.snapshot()
        restoreList({
            ...snapshot,
            items: snapshot.items.filter(item => item.id !== accessId)
        })
    }

    function restoreList(snapshot) {
        rowControls.clear()
        pagedList.restore(snapshot)
    }

    function setMutationBusy(busy) {
        isMutating = busy
        emailInput.disabled = busy
        accessSelect.disabled = busy
        submitButton.disabled = busy
        for (const controls of rowControls.values()) {
            controls.accessSelect.disabled = busy
            controls.removeButton.disabled = busy
        }
    }

    function showFormError(message) {
        formError.textContent = message
        formError.hidden = false
    }

    function clearFormError() {
        formError.textContent = ""
        formError.hidden = true
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

function readCollaborator(value) {
    const accessLevel = normalizeAccessLevel(value?.accessLevel)
    if (
        value === null ||
        typeof value !== "object" ||
        typeof value.id !== "string" ||
        value.id.trim() === "" ||
        typeof value.email !== "string" ||
        value.email.trim() === "" ||
        !COLLABORATOR_ACCESS_LEVELS.has(accessLevel)
    ) {
        throw new TypeError("The API returned invalid collaborator data.")
    }
    return {
        id: value.id,
        email: value.email,
        accessLevel
    }
}
