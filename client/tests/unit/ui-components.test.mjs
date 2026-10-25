import assert from "node:assert/strict"
import test from "node:test"

import { createDialogs } from "../../src/ui/dialog.js"
import { createMenu } from "../../src/ui/menu.js"
import { createStatus } from "../../src/ui/status.js"
import { createFakeApi } from "../helpers/fakeApi.mjs"
import { installAppBrowser } from "../helpers/testBrowser.mjs"

test("status errors are assertive, actionable, and dismissible", async () => {
    const browser = installAppBrowser({ api: createFakeApi() })
    try {
        const heading = browser.document.createElement("h1")
        heading.setAttribute("id", "screen-heading")
        heading.setAttribute("tabindex", "-1")
        browser.document.getElementById("screen").appendChild(heading)
        const status = createStatus(
            browser.document.getElementById("app-status")
        )
        status.show("error", "Access was denied.", {
            action: { text: "Sign in", href: "#/" }
        })

        const element = browser.document.getElementById("app-status")
        assert.equal(element.getAttribute("role"), "alert")
        assert.equal(element.getAttribute("aria-live"), "assertive")
        assert.equal(browser.text("app-status-message"), "Access was denied.")
        assert.equal(
            browser.document.getElementById("app-status-action").href,
            "#/"
        )
        const dismiss = browser.document.getElementById("app-status-dismiss")
        dismiss.focus()
        await dismiss.click()
        assert.equal(element.textContent, "")
        assert.equal(element.getAttribute("role"), "status")
        assert.equal(element.getAttribute("aria-live"), "polite")
        assert.ok(
            browser.document.activeElement === heading,
            "dismissing moves focus to the screen heading"
        )
    } finally {
        browser.restore()
    }
})

test("info and success statuses auto-hide after five seconds", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const browser = installAppBrowser({ api: createFakeApi() })
    try {
        const status = createStatus(
            browser.document.getElementById("app-status")
        )
        status.show("success", "Saved.")
        t.mock.timers.tick(4999)
        assert.equal(browser.text("app-status-message"), "Saved.")
        t.mock.timers.tick(1)
        assert.equal(browser.text("app-status"), "")

        status.show("info", "Working.")
        assert.equal(
            browser.document.getElementById("app-status")
                .getAttribute("role"),
            "status"
        )
        t.mock.timers.tick(5000)
        assert.equal(browser.text("app-status"), "")
    } finally {
        browser.restore()
    }
})

test("confirm dialogs resolve, handle Escape, and restore focus", async () => {
    const browser = installAppBrowser({ api: createFakeApi() })
    try {
        const opener = browser.document.createElement("button")
        browser.document.getElementById("screen").appendChild(opener)
        opener.focus()
        const dialogs = createDialogs(
            browser.document.getElementById("app-dialog")
        )
        browser.queueDialogAnswer(true)
        const confirmed = dialogs.confirmDialog({
            title: "Delete book?",
            message: "This cannot be undone.",
            confirmLabel: "Delete",
            destructive: true
        })
        assert.equal(
            browser.document.activeElement.id,
            "dialog-cancel"
        )
        await browser.settle()
        assert.equal(await confirmed, true)
        assert.equal(browser.document.activeElement, opener)
        assert.deepEqual(browser.dialogs[0], {
            title: "Delete book?",
            message: "This cannot be undone."
        })

        const cancelled = dialogs.confirmDialog({
            title: "Discard changes?",
            message: "Your changes will be lost.",
            confirmLabel: "Discard"
        })
        await browser.document.getElementById("app-dialog")
            .keydown("Escape")
        assert.equal(await cancelled, false)
    } finally {
        browser.restore()
    }
})

test("prompt dialogs keep inline errors and return trimmed values", async () => {
    const browser = installAppBrowser({ api: createFakeApi() })
    try {
        const opener = browser.document.createElement("button")
        browser.document.getElementById("screen").appendChild(opener)
        opener.focus()
        const dialogs = createDialogs(
            browser.document.getElementById("app-dialog")
        )
        let submissions = 0
        browser.queueDialogAnswer(" Duplicate ")
        const result = dialogs.promptDialog({
            title: "New song book",
            label: "Name",
            maxLength: 100,
            required: true,
            confirmLabel: "Create",
            submit: async value => {
                submissions += 1
                assert.equal(value, submissions === 1
                    ? "Duplicate"
                    : "New name")
                return submissions === 1 ? "Choose another name." : null
            }
        })
        assert.equal(
            browser.document.activeElement.id,
            "dialog-input"
        )
        await browser.settle()
        assert.equal(
            browser.text("dialog-error"),
            "Choose another name."
        )
        assert.ok(
            browser.document.activeElement ===
                browser.document.getElementById("dialog-input"),
            "a rejected prompt returns focus to its input"
        )
        assert.equal(
            browser.document.getElementById("app-dialog").open,
            true
        )

        await browser.document.getElementById("dialog-input")
            .input("  New name  ")
        await browser.document.getElementById("dialog-confirm").click()
        assert.equal(await result, "New name")
        assert.equal(browser.document.activeElement, opener)
    } finally {
        browser.restore()
    }
})

test("menus open, close on activation, and return focus on Escape", async () => {
    const browser = installAppBrowser({ api: createFakeApi() })
    try {
        const screen = browser.document.getElementById("screen")
        let selected = 0
        const menu = createMenu({
            label: "⋯",
            accessibleName: "More actions",
            id: "test-menu-panel",
            items: [{
                kind: "button",
                text: "Delete",
                destructive: true,
                action: "delete",
                onSelect() {
                    selected += 1
                }
            }]
        })
        screen.appendChild(menu.root)

        await menu.button.click()
        assert.equal(menu.panel.hidden, false)
        assert.equal(menu.button.getAttribute("aria-expanded"), "true")
        assert.equal(
            browser.document.activeElement,
            menu.panel.children[0]
        )
        await menu.panel.children[0].click()
        assert.equal(selected, 1)
        assert.equal(menu.panel.hidden, true)

        await menu.button.click()
        await menu.panel.children[0].keydown("Escape")
        assert.equal(menu.panel.hidden, true)
        assert.equal(menu.button.getAttribute("aria-expanded"), "false")
        assert.equal(browser.document.activeElement, menu.button)
    } finally {
        browser.restore()
    }
})

test("menu actions run from the menu button so their dialogs return focus to it", async () => {
    const browser = installAppBrowser({ api: createFakeApi() })
    try {
        const dialogs = createDialogs(
            browser.document.getElementById("app-dialog")
        )
        let focusedDuringAction = null
        const menu = createMenu({
            label: "⋯",
            accessibleName: "More actions",
            id: "focus-menu-panel",
            items: [{
                kind: "button",
                text: "Rename",
                action: "rename",
                onSelect() {
                    focusedDuringAction = browser.document.activeElement
                    return dialogs.confirmDialog({
                        title: "Rename?",
                        message: "Choose a new name.",
                        confirmLabel: "Rename"
                    })
                }
            }]
        })
        browser.document.getElementById("screen").appendChild(menu.root)

        await menu.button.click()
        browser.queueDialogAnswer(false)
        await menu.panel.children[0].click()
        await browser.settle()

        assert.equal(menu.panel.hidden, true)
        assert.ok(
            focusedDuringAction === menu.button,
            "menu actions start with focus on the menu button"
        )
        assert.ok(
            browser.document.activeElement === menu.button,
            "closing the dialog returns focus to the menu button"
        )
    } finally {
        browser.restore()
    }
})

test("dialogs focus the screen heading when the opener cannot take focus", async () => {
    const browser = installAppBrowser({ api: createFakeApi() })
    try {
        const screen = browser.document.getElementById("screen")
        const heading = browser.document.createElement("h1")
        heading.setAttribute("id", "screen-heading")
        heading.setAttribute("tabindex", "-1")
        const panel = browser.document.createElement("div")
        const opener = browser.document.createElement("button")
        panel.appendChild(opener)
        screen.appendChild(heading)
        screen.appendChild(panel)
        const dialogs = createDialogs(
            browser.document.getElementById("app-dialog")
        )

        opener.focus()
        panel.hidden = true
        browser.queueDialogAnswer(false)
        assert.equal(await dialogs.confirmDialog({
            title: "Delete?",
            message: "This cannot be undone.",
            confirmLabel: "Delete"
        }), false)
        assert.ok(
            browser.document.activeElement === heading,
            "a hidden opener falls back to the heading"
        )

        panel.hidden = false
        opener.focus()
        const removal = dialogs.confirmDialog({
            title: "Delete?",
            message: "This cannot be undone.",
            confirmLabel: "Delete"
        })
        opener.remove()
        await browser.document.getElementById("dialog-confirm").click()
        assert.equal(await removal, true)
        assert.ok(
            browser.document.activeElement === heading,
            "a removed opener falls back to the heading"
        )
    } finally {
        browser.restore()
    }
})
