import { ApiError } from "../httpClient.js"
import { readPage } from "../pagination.js"
import {
    getSongBook,
    getSongBookAccess,
    removeSongBookAccess,
    setSongBookAccess
} from "../songBooksApi.js"
import { findActionTarget, hasLostFocus } from "../ui/dom.js"
import { createShareLinkControls } from "../ui/shareLinkControls.js"
import { getSongBookAccessErrorMessage } from "../ui/errors.js"
import { displayValue, normalizeAccessLevel } from "../ui/format.js"
import {
    COLLABORATOR_ACCESS_LEVELS,
    createCollaboratorList,
    createShareView,
    readCollaborator
} from "../ui/shareForm.js"

export async function renderShareScreen(ctx) {
    const bookId = ctx.params.bookId
    let isMutating = false
    let isInitialLoad = true
    let initialAccessError = null

    ctx.setTitle(["Share"])
    ctx.setBreadcrumb([{ text: "Share" }])

    const {
        heading,
        intro,
        emailInput,
        accessSelect,
        submitButton,
        formError,
        shareForm,
        collaboratorList,
        listState,
        moreButton
    } = createShareView({ onSubmit: event => addCollaborator(event) })
    const readerLink = createShareLinkControls(ctx, bookId, error =>
        ctx.handleError(error, bookScope()))
    ctx.root.replaceChildren(
        heading,
        intro,
        readerLink.root,
        shareForm,
        collaboratorList,
        listState,
        moreButton
    )

    const collaborators = createCollaboratorList({
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
        collaborators.reload()
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
    await readerLink.load()

    if (initialAccessError !== null) {
        await handleCollaboratorLoadError(initialAccessError)
    }

    return { focusTarget: heading, cleanup: readerLink.cleanup }

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

            collaborators.upsert(saved)
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
                if (shouldFocusEmail || hasLostFocus()) {
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
        const collaborator = collaborators.items().find(
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
            collaborators.upsert(updated)
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
                if (hasLostFocus()) {
                    (
                        collaborators.accessSelectFor(accessId) ??
                        emailInput
                    ).focus()
                }
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
        const collaborator = collaborators.items().find(
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
            collaborators.remove(collaborator.id)
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
                if (shouldFocusEmail || hasLostFocus()) {
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
                collaborators.remove(accessId)
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

    function setMutationBusy(busy) {
        isMutating = busy
        emailInput.disabled = busy
        accessSelect.disabled = busy
        submitButton.disabled = busy
        collaborators.setDisabled(busy)
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
