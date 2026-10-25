import assert from "node:assert/strict"
import test from "node:test"

import { createAppHarness } from "../helpers/appHarness.mjs"
import { createFakeApi } from "../helpers/fakeApi.mjs"

function findElement(root, predicate) {
    for (const child of root.children ?? []) {
        if (predicate(child)) {
            return child
        }
        const nested = findElement(child, predicate)
        if (nested !== null) {
            return nested
        }
    }
    return null
}

async function anonymousApp(initialUrl) {
    const api = createFakeApi()
    const harness = createAppHarness(api, { initialUrl })
    await harness.app.ready
    return { ...harness, api }
}

test("auth views switch in place and focus their first field", async () => {
    const { browser } = await anonymousApp()
    try {
        assert.equal(browser.location.hash, "")
        assert.equal(browser.text("screen-heading"), "Sign in")
        for (const [view, heading, fieldId] of [
            ["forgot-password", "Forgot password", "forgot-password-email"],
            [
                "resend-confirmation",
                "Resend confirmation",
                "resend-confirmation-email"
            ],
            ["register", "Create account", "register-email"]
        ]) {
            if (browser.text("screen-heading") !== "Sign in") {
                const backToLogin = findElement(
                    browser.document.body,
                    element => element.dataset?.authView === "login"
                )
                await backToLogin.click()
            }
            const control = findElement(
                browser.document.body,
                element => element.dataset?.authView === view
            )
            await control.click()
            assert.equal(browser.text("screen-heading"), heading)
            assert.equal(browser.document.activeElement.id, fieldId)
            assert.equal(browser.location.hash, "")
            assert.equal(
                findElement(
                    browser.document.body,
                    element => element.dataset?.authView === "login"
                ).textContent,
                view === "register"
                    ? "Already have an account? Sign in"
                    : "Back to sign in"
            )
        }
        const backToLogin = findElement(
            browser.document.body,
            element => element.dataset?.authView === "login"
        )
        await backToLogin.click()
        assert.equal(browser.text("screen-heading"), "Sign in")
        assert.equal(
            browser.document.activeElement.id,
            "login-email"
        )
    } finally {
        browser.restore()
    }
})

test("registration validates passwords, reports safe API details, and prefills sign-in", async () => {
    const api = createFakeApi()
    api.seed.account("existing@example.com")
    const { app, browser } = createAppHarness(api)
    try {
        await app.ready
        const viewButton = findElement(
            browser.document.body,
            element => element.dataset?.authView === "register"
        )
        await viewButton.click()

        const form = browser.document.getElementById("register-form")
        browser.document.getElementById("register-email").value =
            "new@example.com"
        browser.document.getElementById("register-password").value =
            "StrongPassword123!"
        browser.document.getElementById("register-confirm-password").value =
            "OtherPassword123!"
        await form.submit()
        assert.equal(browser.text("app-status-message"), "The passwords do not match.")
        assert.equal(
            browser.document.activeElement.id,
            "register-confirm-password"
        )

        browser.document.getElementById("register-email").value =
            "existing@example.com"
        browser.document.getElementById("register-confirm-password").value =
            "StrongPassword123!"
        await form.submit()
        assert.equal(
            browser.text("app-status-message"),
            "Registration could not be completed. The email is already in use."
        )

        browser.document.getElementById("register-email").value =
            "new@example.com"
        await form.submit()
        assert.equal(browser.text("screen-heading"), "Sign in")
        assert.equal(browser.document.getElementById("login-email").value,
            "new@example.com")
        assert.equal(
            browser.text("app-status-message"),
            "Registration received. Use the confirmation link sent by email before signing in."
        )
    } finally {
        browser.restore()
    }
})

test("forgot-password and resend-confirmation show generic success feedback", async () => {
    const { browser } = await anonymousApp()
    try {
        const forgot = findElement(
            browser.document.body,
            element => element.dataset?.authView === "forgot-password"
        )
        await forgot.click()
        const forgotEmail = browser.document.getElementById(
            "forgot-password-email"
        )
        forgotEmail.value = "person@example.com"
        forgotEmail.focus()
        await browser.document.getElementById("forgot-password-form").submit()
        assert.equal(
            browser.text("app-status-message"),
            "If the account is eligible, an email was sent."
        )
        assert.ok(
            browser.document.activeElement === forgotEmail,
            "focus returns to the field that submitted the form"
        )

        const back = findElement(
            browser.document.body,
            element => element.dataset?.authView === "login"
        )
        await back.click()
        const resend = findElement(
            browser.document.body,
            element => element.dataset?.authView === "resend-confirmation"
        )
        await resend.click()
        browser.document.getElementById("resend-confirmation-email").value =
            "person@example.com"
        await browser.document.getElementById(
            "resend-confirmation-form"
        ).submit()
        assert.equal(
            browser.text("app-status-message"),
            "If the account is eligible, an email was sent."
        )
    } finally {
        browser.restore()
    }
})

test("auth confirmation links are sanitized without losing the hash", async () => {
    const { app, browser } = await anonymousApp(
        "https://localhost/?auth=confirmed&email=private%40example.com&code=secret#/books/deep-book"
    )
    try {
        assert.equal(browser.location.hash, "#/books/deep-book")
        assert.equal(browser.location.search, "")
        assert.equal(browser.text("app-status-message"),
            "Email confirmed. You can now sign in.")
        assert.equal(app.context.auth.forceAuth, false)
    } finally {
        browser.restore()
    }
})

test("reset-password links prefill credentials, sanitize the URL, and return to sign-in", async () => {
    const api = createFakeApi()
    api.intercept(request =>
        request.path === "/auth/reset-password"
            ? { status: 204, body: null }
            : undefined
    )
    const { app, browser } = createAppHarness(api, {
        initialUrl:
            "https://localhost/?auth=reset-password&email=owner%40example.com&code=reset-token#/books/deep-book"
    })
    try {
        await app.ready
        assert.equal(browser.text("screen-heading"), "Reset password")
        assert.equal(
            browser.document.getElementById("reset-password-email").value,
            "owner@example.com"
        )
        assert.equal(
            browser.document.getElementById("reset-password-code").value,
            "reset-token"
        )
        assert.equal(browser.location.hash, "#/books/deep-book")
        assert.equal(browser.location.search, "")

        browser.document.getElementById("reset-password-new-password").value =
            "NewPassword123!"
        browser.document.getElementById(
            "reset-password-confirm-password"
        ).value = "NewPassword123!"
        await browser.document.getElementById("reset-password-form").submit()
        assert.equal(browser.text("screen-heading"), "Sign in")
        assert.equal(
            browser.document.getElementById("login-email").value,
            "owner@example.com"
        )
        assert.equal(
            browser.text("app-status-message"),
            "Password reset. Sign in with the new password."
        )
        assert.equal(browser.location.hash, "#/books/deep-book")
    } finally {
        browser.restore()
    }
})

test("sign-in failures keep the form and show the ported message", async () => {
    const { browser } = await anonymousApp()
    try {
        browser.document.getElementById("login-email").value =
            "missing@example.com"
        browser.document.getElementById("login-password").value =
            "Password123!"
        await browser.document.getElementById("login-form").submit()
        assert.equal(
            browser.text("app-status-message"),
            "Sign-in failed. Check your credentials or use the confirmation and password recovery options."
        )
        assert.equal(browser.document.activeElement.id, "login-password")
        assert.equal(browser.screen(), "auth")
    } finally {
        browser.restore()
    }
})
