import { ApiError } from "../httpClient.js"
import {
    deleteManagedUser,
    getManagedUsers,
    setManagedUserBan,
    setManagedUserRole
} from "../moderationApi.js"
import { readPage } from "../pagination.js"
import { h } from "../ui/dom.js"
import {
    getLoadUsersErrorMessage,
    getManagedUserActionErrorMessage
} from "../ui/errors.js"
import { displayValue } from "../ui/format.js"
import { createMenu } from "../ui/menu.js"
import { createPagedList } from "../ui/pagedList.js"

const MANAGEMENT_ROLES = new Set(["moderator", "superuser"])
const USER_ROLES = new Set(["user", "moderator", "superuser"])

const USER_ACTIONS = Object.freeze({
    "grant-moderator": {
        label: "Make moderator",
        title: "Make moderator?",
        confirmLabel: "Make moderator",
        confirmation: email =>
            `Allow ${email} to ban and delete other users?`,
        success: "Moderator access granted.",
        destructive: false,
        mutate: userId => setManagedUserRole(userId, "moderator")
    },
    "remove-moderator": {
        label: "Remove moderator",
        title: "Remove moderator?",
        confirmLabel: "Remove moderator",
        confirmation: email =>
            `Remove Moderator access from ${email}?`,
        success: "Moderator access removed.",
        destructive: false,
        mutate: userId => setManagedUserRole(userId, "user")
    },
    "ban-user": {
        label: "Ban",
        title: "Ban account?",
        confirmLabel: "Ban",
        confirmation: email =>
            `Ban ${email}? Their active sessions will end.`,
        success: "Account banned.",
        destructive: true,
        mutate: userId => setManagedUserBan(userId, true)
    },
    "unban-user": {
        label: "Unban",
        title: null,
        confirmLabel: null,
        confirmation: null,
        success: "Account unbanned.",
        destructive: false,
        mutate: userId => setManagedUserBan(userId, false)
    },
    "delete-user": {
        label: "Delete user",
        title: "Delete account?",
        confirmLabel: "Delete user",
        confirmation: email =>
            `Permanently delete ${email} and all of their song books and songs? This cannot be undone.`,
        success: "Account and its song books deleted.",
        destructive: true,
        mutate: userId => deleteManagedUser(userId)
    }
})

export async function renderUsersScreen(ctx) {
    let isMutating = false
    let refreshingAccess = null
    const rowMenus = new Map()

    ctx.setTitle(["Users"])
    ctx.setBreadcrumb([{ text: "Users" }])

    const heading = h("h1", {
        id: "screen-heading",
        attrs: { tabindex: "-1" },
        text: "Users"
    })
    const userList = h("ul", {
        id: "user-list",
        className: "row-list user-list"
    })
    const listState = h("p", {
        id: "user-list-state",
        className: "list-state",
        text: "Loading users…"
    })
    const moreButton = h("button", {
        id: "show-more-users",
        className: "button button--neutral",
        type: "button",
        attrs: { "aria-label": "Show more users" },
        hidden: true,
        disabled: true,
        text: "Show more"
    })
    ctx.root.replaceChildren(heading, userList, listState, moreButton)

    const pagedList = createPagedList({
        list: userList,
        stateElement: listState,
        moreButton,
        fetchPage: fetchUsers,
        renderItem: renderUser,
        getKey: user => user.id,
        messages: {
            loading: "Loading users…",
            empty: () => h("span", { text: "No other users." }),
            error: getLoadUsersErrorMessage
        },
        signal: ctx.signal
    })

    await pagedList.reload()
    if (!ctx.isCurrent()) {
        return { focusTarget: heading }
    }
    return {
        focusTarget: heading,
        cleanup: clearRowMenus
    }

    async function fetchUsers(page, signal) {
        try {
            const result = readPage(
                await getManagedUsers(page, { signal }),
                page
            )
            return {
                ...result,
                items: result.items.map(readManagedUser)
            }
        } catch (error) {
            await handleLoadError(error)
            throw error
        }
    }

    async function handleLoadError(error) {
        if (!ctx.isCurrent() || error?.name === "AbortError") {
            return
        }
        if (error instanceof ApiError && error.status === 401) {
            await ctx.handleError(error)
            return
        }
        if (error instanceof ApiError && error.status === 403) {
            const access = await refreshUserAccess()
            if (
                access.authorized &&
                access.roleChanged &&
                ctx.isCurrent()
            ) {
                await reloadUsers()
            }
            return
        }
        if (!(error instanceof ApiError)) {
            console.error(error)
        }
    }

    async function refreshUserAccess() {
        if (refreshingAccess !== null) {
            return refreshingAccess
        }

        const previousRole = ctx.session.state.role
        const previousEmail = ctx.session.state.email
        const refresh = (async () => {
            const state = await ctx.refreshSession()
            if (!ctx.isCurrent()) {
                return { authorized: false, roleChanged: false }
            }
            if (state.status === "unavailable") {
                await ctx.router.render({ focus: true })
                return { authorized: false, roleChanged: false }
            }
            if (
                state.status !== "authenticated" ||
                !MANAGEMENT_ROLES.has(state.role)
            ) {
                await ctx.navigate(ctx.href("library"), {
                    replace: true,
                    status: {
                        type: "error",
                        message: "You no longer have access to user management."
                    }
                })
                return { authorized: false, roleChanged: false }
            }

            const roleChanged = state.role !== previousRole
            if (roleChanged || state.email !== previousEmail) {
                ctx.shell.renderAccountMenu()
                for (const menu of rowMenus.values()) {
                    ctx.registerMenu(menu)
                }
            }
            return { authorized: true, roleChanged }
        })()
        refreshingAccess = refresh.finally(() => {
            refreshingAccess = null
        })
        return refreshingAccess
    }

    function renderUser(value) {
        const user = readManagedUser(value)
        const email = displayValue(user.email, "Account without email")
        const role = user.role === "superuser"
            ? "SuperUser"
            : user.role === "moderator"
                ? "Moderator"
                : "User"
        const status = user.isBanned
            ? "Banned"
            : user.emailConfirmed
                ? "Active"
                : "Unconfirmed"
        const summary = h("div", {
            className: "user-item__summary"
        },
        h("strong", {
            className: "user-item__email",
            text: email
        }),
        h("span", {
            className: "user-item__meta",
            text: `${role} · ${status}`
        }))
        const children = [summary]
        const menu = renderUserMenu(user, email)
        if (menu !== null) {
            children.push(h("div", {
                className: "user-item__actions"
            }, menu.root))
        }
        return h("li", {
            className: "user-item",
            dataset: { userId: user.id }
        }, ...children)
    }

    function renderUserMenu(user, email) {
        const actions = getUserActions(user, ctx.session.state.role)
        if (actions.length === 0) {
            return null
        }

        const encodedId = encodeURIComponent(user.id)
        const menu = ctx.registerMenu(createMenu({
            label: "⋯",
            accessibleName: `Actions for ${email}`,
            buttonId: `user-menu-button-${encodedId}`,
            id: `user-menu-panel-${encodedId}`,
            items: actions.map(action => ({
                kind: "button",
                text: USER_ACTIONS[action].label,
                action,
                destructive: USER_ACTIONS[action].destructive,
                onSelect: () => handleUserAction(user, action)
            }))
        }))
        menu.button.dataset.action = "user-menu"
        setMenuDisabled(menu, isMutating)
        rowMenus.set(user.id, menu)
        return menu
    }

    async function handleUserAction(user, action) {
        if (
            !ctx.isCurrent() ||
            isMutating ||
            !getUserActions(user, ctx.session.state.role).includes(action)
        ) {
            return
        }

        const definition = USER_ACTIONS[action]
        if (definition.confirmation !== null) {
            const email = displayValue(user.email, "this account")
            const confirmed = await ctx.dialogs.confirmDialog({
                title: definition.title,
                message: definition.confirmation(email),
                confirmLabel: definition.confirmLabel,
                destructive: definition.destructive
            })
            if (!confirmed || !ctx.isCurrent()) {
                return
            }
        }

        const requestGeneration = ctx.session.state.generation
        setMutationBusy(true)
        try {
            await definition.mutate(user.id)
            if (!isRequestCurrent(requestGeneration)) {
                return
            }
            ctx.status.show("success", definition.success)
            await reloadUsers()
        } catch (error) {
            if (
                !isRequestCurrent(requestGeneration) ||
                error?.name === "AbortError"
            ) {
                return
            }
            await handleMutationError(error)
        } finally {
            if (ctx.isCurrent()) {
                setMutationBusy(false)
            }
        }
    }

    async function handleMutationError(error) {
        if (error instanceof ApiError && error.status === 401) {
            await ctx.handleError(error)
            return
        }
        if (error instanceof ApiError && error.status === 403) {
            const access = await refreshUserAccess()
            if (!access.authorized || !ctx.isCurrent()) {
                return
            }
            ctx.status.show(
                "error",
                "You cannot manage this account. Access may have changed."
            )
            if (access.roleChanged) {
                await reloadUsers()
            }
            return
        }
        if (error instanceof ApiError && error.status === 404) {
            await reloadUsers()
            if (ctx.isCurrent()) {
                ctx.status.show(
                    "error",
                    "This account no longer exists. Refresh users."
                )
            }
            return
        }
        if (!(error instanceof ApiError)) {
            console.error(error)
        }
        ctx.status.show(
            "error",
            getManagedUserActionErrorMessage(error)
        )
    }

    async function reloadUsers() {
        clearRowMenus()
        return pagedList.reload()
    }

    function clearRowMenus() {
        for (const menu of rowMenus.values()) {
            ctx.unregisterMenu(menu)
        }
        rowMenus.clear()
    }

    function setMutationBusy(busy) {
        isMutating = busy
        moreButton.disabled = busy || moreButton.hidden
        for (const menu of rowMenus.values()) {
            setMenuDisabled(menu, busy)
        }
    }

    function isRequestCurrent(generation) {
        return ctx.isCurrent() &&
            ctx.session.state.generation === generation
    }
}

function getUserActions(user, callerRole) {
    const canManageTarget = MANAGEMENT_ROLES.has(callerRole) &&
        user.role !== "superuser" &&
        (
            callerRole === "superuser" ||
            user.role === "user"
        )
    if (!canManageTarget) {
        return []
    }

    const actions = []
    if (callerRole === "superuser") {
        if (user.role === "moderator") {
            actions.push("remove-moderator")
        } else if (!user.isBanned && user.emailConfirmed) {
            actions.push("grant-moderator")
        }
    }
    actions.push(user.isBanned ? "unban-user" : "ban-user")
    actions.push("delete-user")
    return actions
}

function setMenuDisabled(menu, disabled) {
    menu.button.disabled = disabled
    for (const item of menu.panel.children) {
        item.disabled = disabled
    }
}

function readManagedUser(value) {
    if (
        value === null ||
        typeof value !== "object" ||
        typeof value.id !== "string" ||
        value.id.trim() === "" ||
        (
            value.email !== undefined &&
            value.email !== null &&
            typeof value.email !== "string"
        ) ||
        !USER_ROLES.has(value.role) ||
        typeof value.isBanned !== "boolean" ||
        typeof value.emailConfirmed !== "boolean"
    ) {
        throw new TypeError("The API returned invalid user data.")
    }
    return {
        id: value.id,
        email: value.email ?? null,
        role: value.role,
        isBanned: value.isBanned,
        emailConfirmed: value.emailConfirmed
    }
}
