import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

function findUserRow(browser, userId) {
    return [...browser.document.getElementById("user-list").children]
        .find(row => row.dataset.userId === userId)
}

function menuForRow(row) {
    const actions = [...row.children].find(
        child => child.className === "user-item__actions"
    )
    return actions?.children[0] ?? null
}

function actionNames(row) {
    const menu = menuForRow(row)
    return menu === null
        ? []
        : [...menu.children[1].children].map(item => item.dataset.action)
}

function findMenuAction(menu, action) {
    return [...menu.children[1].children]
        .find(item => item.dataset.action === action)
}

async function openUserMenu(browser, userId) {
    const row = findUserRow(browser, userId)
    assert.notEqual(row, undefined)
    const menu = menuForRow(row)
    assert.notEqual(menu, null)
    await menu.children[0].click()
    return menu
}

async function confirmUserAction(
    browser,
    userId,
    action,
    message,
    confirmLabel,
    successMessage
) {
    const menu = await openUserMenu(browser, userId)
    const pendingAction = findMenuAction(menu, action).click()
    await browser.settle()
    assert.equal(browser.text("dialog-message"), message)
    assert.equal(browser.text("dialog-confirm"), confirmLabel)
    await browser.document.getElementById("dialog-confirm").click()
    await pendingAction
    assert.equal(browser.text("app-status-message"), successMessage)
}

test("moderators and SuperUsers see only the permitted user actions", async () => {
    const api = createFakeApi()
    const moderatorId = api.seed.account("moderator@example.com", {
        role: "moderator"
    })
    const superuserId = api.seed.account("superuser@example.com", {
        role: "superuser"
    })
    const otherSuperuserId = api.seed.account(
        "other-superuser@example.com",
        { role: "superuser" }
    )
    const activeId = api.seed.account("active@example.com")
    const bannedId = api.seed.account("banned@example.com", {
        banned: true
    })
    const unconfirmedId = api.seed.account("unconfirmed@example.com", {
        confirmed: false
    })
    const otherModeratorId = api.seed.account("other-moderator@example.com", {
        role: "moderator"
    })

    api.signIn("moderator@example.com")
    const moderator = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await moderator.app.ready
        assert.equal(moderator.browser.screen(), "users")
        assert.equal(
            moderator.browser.document.title,
            "Users · Śpiewnik SpoTkanie"
        )
        assert.equal(
            moderator.browser.document.getElementById("app-breadcrumb")
                .textContent,
            "Users"
        )
        assert.equal(
            moderator.browser.document.getElementById("manage-users-link")
                .getAttribute("href"),
            "#/users"
        )
        assert.equal(
            moderator.browser.document.getElementById("user-list").children
                .length,
            6
        )
        assert.equal(findUserRow(moderator.browser, moderatorId), undefined)
        assert.equal(
            findUserRow(moderator.browser, activeId).children[0].children[1]
                .textContent,
            "User · Active"
        )
        assert.equal(
            findUserRow(moderator.browser, bannedId).children[0].children[1]
                .textContent,
            "User · Banned"
        )
        assert.equal(
            findUserRow(moderator.browser, unconfirmedId)
                .children[0].children[1].textContent,
            "User · Unconfirmed"
        )
        assert.equal(
            findUserRow(moderator.browser, otherModeratorId)
                .children[0].children[1].textContent,
            "Moderator · Active"
        )
        assert.equal(
            findUserRow(moderator.browser, superuserId)
                .children[0].children[1].textContent,
            "SuperUser · Active"
        )
        assert.deepEqual(
            actionNames(findUserRow(moderator.browser, activeId)),
            ["ban-user", "delete-user"]
        )
        assert.deepEqual(
            actionNames(findUserRow(moderator.browser, bannedId)),
            ["unban-user", "delete-user"]
        )
        assert.deepEqual(
            actionNames(findUserRow(moderator.browser, unconfirmedId)),
            ["ban-user", "delete-user"]
        )
        assert.deepEqual(
            actionNames(findUserRow(moderator.browser, otherModeratorId)),
            []
        )
        assert.deepEqual(
            actionNames(findUserRow(moderator.browser, superuserId)),
            []
        )
        assert.equal(
            menuForRow(findUserRow(moderator.browser, activeId))
                .children[0].getAttribute("aria-label"),
            "Actions for active@example.com"
        )
    } finally {
        moderator.browser.restore()
    }

    api.signIn("superuser@example.com")
    const superuser = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await superuser.app.ready
        assert.equal(superuser.browser.screen(), "users")
        assert.equal(
            superuser.browser.document.getElementById("manage-users-link")
                .getAttribute("href"),
            "#/users"
        )
        assert.deepEqual(
            actionNames(findUserRow(superuser.browser, activeId)),
            ["grant-moderator", "ban-user", "delete-user"]
        )
        assert.deepEqual(
            actionNames(findUserRow(superuser.browser, bannedId)),
            ["unban-user", "delete-user"]
        )
        assert.deepEqual(
            actionNames(findUserRow(superuser.browser, unconfirmedId)),
            ["ban-user", "delete-user"]
        )
        assert.deepEqual(
            actionNames(findUserRow(superuser.browser, otherModeratorId)),
            ["remove-moderator", "ban-user", "delete-user"]
        )
        assert.deepEqual(
            actionNames(findUserRow(superuser.browser, moderatorId)),
            ["remove-moderator", "ban-user", "delete-user"]
        )
        assert.deepEqual(
            actionNames(findUserRow(superuser.browser, otherSuperuserId)),
            []
        )
        assert.equal(
            findUserRow(superuser.browser, superuserId),
            undefined
        )
    } finally {
        superuser.browser.restore()
    }
})

test("user actions use the required confirmations and success messages", async () => {
    const api = createFakeApi()
    api.seed.account("superuser@example.com", { role: "superuser" })
    const activeId = api.seed.account("active@example.com")
    const deleteId = api.seed.account("delete@example.com")
    api.seed.account("moderator-target@example.com", { role: "moderator" })
    api.seed.account("banned@example.com", { banned: true })
    api.signIn("superuser@example.com")

    const { app, browser } = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await app.ready
        await confirmUserAction(
            browser,
            activeId,
            "grant-moderator",
            "Allow active@example.com to ban and delete other users?",
            "Make moderator",
            "Moderator access granted."
        )
        assert.equal(
            findUserRow(browser, activeId).children[0].children[1].textContent,
            "Moderator · Active"
        )

        await confirmUserAction(
            browser,
            activeId,
            "remove-moderator",
            "Remove Moderator access from active@example.com?",
            "Remove moderator",
            "Moderator access removed."
        )
        await confirmUserAction(
            browser,
            activeId,
            "ban-user",
            "Ban active@example.com? Their active sessions will end.",
            "Ban",
            "Account banned."
        )

        const bannedMenu = await openUserMenu(browser, activeId)
        const unbanAction = findMenuAction(bannedMenu, "unban-user")
            .click()
        await browser.settle()
        assert.equal(browser.document.getElementById("app-dialog").open, false)
        await unbanAction
        assert.equal(
            browser.text("app-status-message"),
            "Account unbanned."
        )

        await confirmUserAction(
            browser,
            deleteId,
            "delete-user",
            "Permanently delete delete@example.com and all of their song books and songs? This cannot be undone.",
            "Delete user",
            "Account and its song books deleted."
        )
        assert.equal(findUserRow(browser, deleteId), undefined)
        assert.equal(api.requests.some(request =>
            request.method === "DELETE" &&
            request.path === `/admin/users/${deleteId}`
        ), true)
    } finally {
        browser.restore()
    }
})

test("users screen shows empty and missing-email states safely", async () => {
    const emptyApi = createFakeApi()
    emptyApi.seed.account("moderator@example.com", { role: "moderator" })
    emptyApi.signIn("moderator@example.com")
    const empty = createAppHarness(emptyApi, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await empty.app.ready
        assert.equal(
            empty.browser.text("user-list-state"),
            "No other users."
        )
        assert.equal(
            empty.browser.document.getElementById("show-more-users").hidden,
            true
        )
    } finally {
        empty.browser.restore()
    }

    const api = createFakeApi()
    api.seed.account("superuser@example.com", { role: "superuser" })
    api.signIn("superuser@example.com")
    const stopOverride = api.intercept(request =>
        request.method === "GET" && request.path === "/admin/users"
            ? {
                status: 200,
                body: {
                    items: [{
                        id: "missing-email",
                        email: null,
                        role: "user",
                        isBanned: false,
                        emailConfirmed: true
                    }],
                    page: 1,
                    hasNext: false
                }
            }
            : undefined
    )
    const missingEmail = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await missingEmail.app.ready
        const row = findUserRow(missingEmail.browser, "missing-email")
        assert.match(row.textContent, /Account without email/)
        const menu = menuForRow(row)
        assert.equal(
            menu.children[0].getAttribute("aria-label"),
            "Actions for Account without email"
        )
        const action = findMenuAction(menu, "grant-moderator").click()
        await missingEmail.browser.settle()
        assert.equal(
            missingEmail.browser.text("dialog-message"),
            "Allow this account to ban and delete other users?"
        )
        await missingEmail.browser.document.getElementById(
            "dialog-cancel"
        ).click()
        await action
        assert.equal(
            missingEmail.browser.document.getElementById("app-dialog").open,
            false
        )
    } finally {
        stopOverride()
        missingEmail.browser.restore()
    }
})

test("show more appends users from the next page", async () => {
    const api = createFakeApi()
    api.seed.account("moderator@example.com", { role: "moderator" })
    for (let index = 0; index < 51; index++) {
        api.seed.account(
            `member-${String(index).padStart(3, "0")}@example.com`
        )
    }
    api.signIn("moderator@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await app.ready
        const list = browser.document.getElementById("user-list")
        assert.equal(list.children.length, 50)
        const moreButton = browser.document.getElementById("show-more-users")
        assert.equal(moreButton.hidden, false)
        assert.equal(
            moreButton.getAttribute("aria-label"),
            "Show more users"
        )

        await moreButton.click()
        assert.equal(list.children.length, 51)
        assert.equal(moreButton.hidden, true)
        assert.equal(api.requests.some(request =>
            request.method === "GET" &&
            request.path === "/admin/users" &&
            request.query.page === "2"
        ), true)
    } finally {
        browser.restore()
    }
})

test("non-moderators are redirected from user management", async () => {
    const api = createFakeApi()
    api.seed.account("user@example.com")
    api.signIn("user@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await app.ready
        assert.equal(browser.screen(), "library")
        assert.equal(browser.location.hash, "#/")
        assert.equal(
            browser.text("app-status-message"),
            "You don't have access to user management."
        )
        assert.equal(
            browser.document.getElementById("manage-users-link"),
            null
        )
        assert.equal(api.requests.some(request =>
            request.path === "/admin/users"
        ), false)
    } finally {
        browser.restore()
    }
})

test("a user-list 401 ends the session and removes private content", async () => {
    const api = createFakeApi()
    api.seed.account("moderator@example.com", { role: "moderator" })
    api.seed.account("private@example.com")
    api.signIn("moderator@example.com")
    const failUsers = api.intercept(request =>
        request.method === "GET" && request.path === "/admin/users"
            ? { status: 401, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await app.ready
        assert.equal(browser.screen(), "auth")
        assert.equal(
            browser.text("app-status-message"),
            "Your session ended. Sign in to access your song books."
        )
        assert.equal(browser.document.getElementById("user-list"), null)
        assert.equal(app.context.session.state.status, "anonymous")
    } finally {
        failUsers()
        browser.restore()
    }
})

test("a 403 after user-list loading rechecks access and redirects if revoked", async () => {
    const api = createFakeApi()
    api.seed.account("moderator@example.com", { role: "moderator" })
    api.seed.account("member@example.com")
    api.signIn("moderator@example.com")
    const revokeRole = api.intercept(request => {
        if (
            request.method === "GET" &&
            request.path === "/admin/users"
        ) {
            api.seed.account("moderator@example.com", { role: "user" })
            return { status: 403, body: null }
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await app.ready
        assert.equal(browser.screen(), "library")
        assert.equal(browser.location.hash, "#/")
        assert.equal(
            browser.text("app-status-message"),
            "You no longer have access to user management."
        )
        assert.equal(app.context.session.state.role, "user")
    } finally {
        revokeRole()
        browser.restore()
    }
})

test("a 403 keeps a still-authorized moderator on a retryable users screen", async () => {
    const api = createFakeApi()
    api.seed.account("moderator@example.com", { role: "moderator" })
    api.seed.account("member@example.com")
    api.signIn("moderator@example.com")
    const denyUsers = api.intercept(request =>
        request.method === "GET" && request.path === "/admin/users"
            ? { status: 403, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await app.ready
        assert.equal(browser.screen(), "users")
        assert.equal(
            browser.document.getElementById("user-list-state")
                .children[0].textContent,
            "Could not load users. Try again."
        )
        assert.equal(
            browser.document.getElementById("user-list-state")
                .children[1].textContent,
            "Try again"
        )
        assert.equal(app.context.session.state.role, "moderator")
        await browser.document.getElementById("user-list-state")
            .children[1].click()
        assert.equal(
            browser.document.getElementById("user-list-state")
                .children[0].textContent,
            "Could not load users. Try again."
        )
    } finally {
        denyUsers()
        browser.restore()
    }
})

test("a mutation 403 rechecks role changes and exits when moderation is revoked", async () => {
    const api = createFakeApi()
    api.seed.account("moderator@example.com", { role: "moderator" })
    const targetId = api.seed.account("member@example.com")
    api.signIn("moderator@example.com")
    const revokeRole = api.intercept(request => {
        if (
            request.method === "PUT" &&
            request.path === `/admin/users/${targetId}/ban`
        ) {
            api.seed.account("moderator@example.com", { role: "user" })
            return { status: 403, body: null }
        }
        return undefined
    })
    const { app, browser } = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    try {
        await app.ready
        const menu = await openUserMenu(browser, targetId)
        const pendingAction = findMenuAction(menu, "ban-user").click()
        await browser.settle()
        assert.equal(
            browser.text("dialog-message"),
            "Ban member@example.com? Their active sessions will end."
        )
        await browser.document.getElementById("dialog-confirm").click()
        await pendingAction
        assert.equal(browser.screen(), "library")
        assert.equal(
            browser.text("app-status-message"),
            "You no longer have access to user management."
        )
        assert.equal(app.context.session.state.role, "user")
    } finally {
        revokeRole()
        browser.restore()
    }
})

test("a late next-page response after sign-out cannot restore user data", async () => {
    const api = createFakeApi()
    api.seed.account("moderator@example.com", { role: "moderator" })
    for (let index = 0; index < 51; index++) {
        api.seed.account(
            `member-${String(index).padStart(3, "0")}@example.com`
        )
    }
    api.signIn("moderator@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    let releaseRequest
    let markRequestStarted
    const requestStarted = new Promise(resolve => {
        markRequestStarted = resolve
    })
    const requestReleased = new Promise(resolve => {
        releaseRequest = resolve
    })
    const holdSecondPage = api.intercept(async request => {
        if (
            request.method === "GET" &&
            request.path === "/admin/users" &&
            request.query.page === "2"
        ) {
            markRequestStarted()
            await requestReleased
        }
        return undefined
    })

    try {
        await app.ready
        const loadMore = browser.document.getElementById("show-more-users")
            .click()
        await requestStarted
        await browser.document.getElementById("account-menu-button").click()
        await browser.document.getElementById("sign-out-button").click()
        assert.equal(browser.screen(), "auth")
        releaseRequest()
        await loadMore
        assert.equal(browser.document.getElementById("user-list"), null)
        assert.equal(browser.text("app-status-message"), "Signed out.")
        assert.doesNotMatch(browser.text("screen"), /member-050@example\.com/)
    } finally {
        releaseRequest()
        holdSecondPage()
        browser.restore()
    }
})

test("a late moderation response after sign-out cannot restore private UI", async () => {
    const api = createFakeApi()
    api.seed.account("moderator@example.com", { role: "moderator" })
    const targetId = api.seed.account("member@example.com")
    api.signIn("moderator@example.com")
    const { app, browser } = createAppHarness(api, {
        initialUrl: "https://localhost/#/users"
    })
    let releaseRequest
    let markRequestStarted
    const requestStarted = new Promise(resolve => {
        markRequestStarted = resolve
    })
    const requestReleased = new Promise(resolve => {
        releaseRequest = resolve
    })
    const holdMutation = api.intercept(async request => {
        if (
            request.method === "PUT" &&
            request.path === `/admin/users/${targetId}/ban`
        ) {
            markRequestStarted()
            await requestReleased
            return { status: 204, body: null }
        }
        return undefined
    })

    try {
        await app.ready
        const menu = await openUserMenu(browser, targetId)
        const pendingAction = findMenuAction(menu, "ban-user").click()
        await browser.settle()
        await browser.document.getElementById("dialog-confirm").click()
        await requestStarted
        await browser.document.getElementById("account-menu-button").click()
        await browser.document.getElementById("sign-out-button").click()
        assert.equal(browser.screen(), "auth")
        releaseRequest()
        await pendingAction
        assert.equal(browser.document.getElementById("user-list"), null)
        assert.equal(browser.text("app-status-message"), "Signed out.")
    } finally {
        releaseRequest()
        holdMutation()
        browser.restore()
    }
})
