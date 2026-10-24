import assert from "node:assert/strict"
import test from "node:test"

import {
    APP_SHELL_IDS,
    installAppBrowser
} from "../helpers/testBrowser.mjs"

test("app browser creates the shell and supports connected dynamic elements", () => {
    const browser = installAppBrowser({
        api: { async handle() { return new Response(null, { status: 204 }) } }
    })

    try {
        assert.deepEqual(APP_SHELL_IDS, [
            "app-bar",
            "app-home-link",
            "app-breadcrumb",
            "account-menu",
            "screen",
            "app-status",
            "app-dialog"
        ])
        for (const id of APP_SHELL_IDS) {
            assert.ok(browser.document.getElementById(id), id)
        }
        assert.equal(browser.document.body.children.length, 4)
        assert.equal(
            browser.document.getElementById("app-status").getAttribute("role"),
            "status"
        )
        assert.equal(
            browser.document.getElementById("app-status")
                .getAttribute("aria-live"),
            "polite"
        )
        assert.equal(
            browser.document.getElementById("app-dialog")
                .getAttribute("aria-labelledby"),
            "dialog-title"
        )

        const screen = browser.document.getElementById("screen")
        screen.dataset.screen = "library"
        screen.textContent = "Library"
        assert.equal(browser.screen(), "library")
        assert.equal(browser.text("screen"), "Library")
        assert.equal(browser.document.title, "Śpiewnik SpoTkanie")

        const dynamic = browser.document.createElement("div")
        dynamic.id = "dynamic-content"
        dynamic.className = "row selected"
        screen.appendChild(dynamic)
        assert.equal(browser.document.getElementById("dynamic-content"), dynamic)
        assert.equal(dynamic.isConnected, true)
        assert.equal(screen.contains(dynamic), true)

        dynamic.classList.add("visible")
        assert.equal(dynamic.className, "row selected visible")
        dynamic.classList.remove("row")
        assert.equal(dynamic.classList.contains("row"), false)
        assert.equal(dynamic.classList.toggle("selected"), false)
        assert.equal(dynamic.classList.toggle("selected", true), true)
        dynamic.scrollIntoView()
        dynamic.select()

        screen.removeChild(dynamic)
        assert.equal(dynamic.isConnected, false)
        assert.equal(screen.contains(dynamic), false)
    } finally {
        browser.restore()
    }
})

test("app browser simulates hash navigation, history, and native controls", async () => {
    const browser = installAppBrowser({
        api: { async handle() { return new Response(null, { status: 204 }) } }
    })

    try {
        const hashChanges = []
        browser.window.addEventListener("hashchange", event => {
            hashChanges.push([event.oldURL, event.newURL])
        })

        const link = browser.document.createElement("a")
        link.href = "#/book"
        browser.document.getElementById("screen").appendChild(link)
        await link.click()
        assert.equal(browser.location.hash, "#/book")
        assert.equal(hashChanges.length, 1)
        await browser.back()
        assert.equal(browser.location.hash, "")
        await browser.forward()
        assert.equal(browser.location.hash, "#/book")
        assert.equal(hashChanges.length, 3)

        const form = browser.document.createElement("form")
        const submit = browser.document.createElement("button")
        submit.type = "submit"
        form.appendChild(submit)
        browser.document.getElementById("screen").appendChild(form)
        let submitter = null
        form.addEventListener("submit", event => {
            submitter = event.submitter
            event.preventDefault()
        })
        await submit.click()
        assert.equal(submitter, submit)

        const checkbox = browser.document.createElement("input")
        checkbox.type = "checkbox"
        form.appendChild(checkbox)
        let checkboxChanges = 0
        checkbox.addEventListener("change", () => {
            checkboxChanges += 1
        })
        await checkbox.click()
        assert.equal(checkbox.checked, true)
        assert.equal(checkboxChanges, 1)

        const firstRadio = browser.document.createElement("input")
        firstRadio.type = "radio"
        firstRadio.name = "access"
        firstRadio.checked = true
        const secondRadio = browser.document.createElement("input")
        secondRadio.type = "radio"
        secondRadio.name = "access"
        form.appendChild(firstRadio)
        form.appendChild(secondRadio)
        await secondRadio.click()
        assert.equal(firstRadio.checked, false)
        assert.equal(secondRadio.checked, true)

        const select = browser.document.createElement("select")
        form.appendChild(select)
        let selectedValue = ""
        select.addEventListener("change", () => {
            selectedValue = select.value
        })
        await select.change("editor")
        assert.equal(selectedValue, "editor")

        let customEvents = 0
        const listener = () => {
            customEvents += 1
        }
        browser.window.addEventListener("custom", listener)
        await browser.window.dispatch("custom")
        browser.window.removeEventListener("custom", listener)
        await browser.window.dispatch("custom")
        assert.equal(customEvents, 1)

        browser.window.scrollTo(0, 42)
        assert.equal(browser.window.scrollY, 42)
        browser.window.scrollTo({ top: 18 })
        assert.equal(browser.window.scrollY, 18)
        browser.history.scrollRestoration = "manual"
        assert.equal(browser.history.scrollRestoration, "manual")
    } finally {
        browser.restore()
    }
})

test("dialogs record prompts, apply queued answers, and close on Escape", async () => {
    const browser = installAppBrowser({
        api: { async handle() { return new Response(null, { status: 204 }) } }
    })

    try {
        const dialog = browser.document.getElementById("app-dialog")
        const form = browser.document.createElement("form")
        const title = browser.document.createElement("h2")
        title.id = "dialog-title"
        title.textContent = "Rename book"
        const message = browser.document.createElement("p")
        message.id = "dialog-message"
        message.textContent = "Choose a new name."
        const input = browser.document.createElement("input")
        input.id = "dialog-input"
        const confirm = browser.document.createElement("button")
        confirm.id = "dialog-confirm"
        confirm.type = "submit"
        form.appendChild(title)
        form.appendChild(message)
        form.appendChild(input)
        form.appendChild(confirm)
        dialog.appendChild(form)

        let submitted = false
        form.addEventListener("submit", event => {
            submitted = true
            assert.equal(event.submitter, confirm)
            event.preventDefault()
            dialog.close("confirm")
        })
        browser.queueDialogAnswer("Sunday Service")
        dialog.showModal()
        assert.equal(dialog.open, true)
        assert.deepEqual(browser.dialogs, [{
            title: "Rename book",
            message: "Choose a new name."
        }])
        await browser.settle()
        assert.equal(input.value, "Sunday Service")
        assert.equal(submitted, true)
        assert.equal(dialog.open, false)
        assert.equal(dialog.returnValue, "confirm")

        browser.queueDialogAnswer(true)
        dialog.showModal()
        await browser.settle()
        assert.equal(dialog.open, false)
        assert.equal(dialog.returnValue, "confirm")

        let cancelled = false
        dialog.addEventListener("cancel", event => {
            cancelled = true
            event.preventDefault()
            dialog.close("cancel")
        })
        dialog.showModal()
        await dialog.keydown("Escape")
        await browser.settle()
        assert.equal(cancelled, true)
        assert.equal(dialog.open, false)
        assert.equal(dialog.returnValue, "cancel")

        browser.queueDialogAnswer(false)
        dialog.showModal()
        await browser.settle()
        assert.equal(dialog.open, false)
        assert.equal(dialog.returnValue, "cancel")
    } finally {
        browser.restore()
    }
})

test("app browser delegates fetch and rejects aborted signals with AbortError", async () => {
    let capturedRequest
    let finishRequest
    const api = {
        handle(request) {
            capturedRequest = request
            return new Promise(resolve => {
                finishRequest = resolve
            })
        }
    }
    const browser = installAppBrowser({ api })

    try {
        const controller = new AbortController()
        const pending = globalThis.fetch("/songbooks?search=two+words", {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal
        })
        await new Promise(resolve => setImmediate(resolve))
        assert.deepEqual(capturedRequest, {
            method: "GET",
            path: "/songbooks",
            query: { search: "two words" },
            body: null,
            headers: { accept: "application/json" }
        })

        controller.abort()
        await assert.rejects(pending, error =>
            error instanceof DOMException &&
            error.name === "AbortError"
        )
        finishRequest(new Response(null, { status: 204 }))
        await browser.settle()

        const alreadyAborted = new AbortController()
        alreadyAborted.abort()
        await assert.rejects(
            globalThis.fetch("/songbooks", { signal: alreadyAborted.signal }),
            error =>
                error instanceof DOMException &&
                error.name === "AbortError"
        )
    } finally {
        browser.restore()
    }
})
