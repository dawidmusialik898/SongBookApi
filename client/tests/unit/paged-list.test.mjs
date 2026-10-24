import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../../src/httpClient.js"
import { h } from "../../src/ui/dom.js"
import { createPagedList } from "../../src/ui/pagedList.js"
import { createFakeApi } from "../helpers/fakeApi.mjs"
import { installAppBrowser } from "../helpers/testBrowser.mjs"

function createList(fetchPage, { signal } = {}) {
    const browser = installAppBrowser({ api: createFakeApi() })
    const list = h("ul", {})
    const stateElement = h("p", {})
    const moreButton = h("button", {
        type: "button",
        text: "Show more"
    })
    browser.document.getElementById("screen").appendChild(list)
    browser.document.getElementById("screen").appendChild(stateElement)
    browser.document.getElementById("screen").appendChild(moreButton)
    const pagedList = createPagedList({
        list,
        stateElement,
        moreButton,
        fetchPage,
        renderItem: item => h("li", {
            dataset: { itemId: item.id },
            text: item.name
        }),
        getKey: item => item.id,
        messages: {
            loading: "Loading…",
            empty: () => h("span", { text: "No items." }),
            error: error => `Could not load items: ${error.message}`
        },
        signal
    })
    return { browser, list, stateElement, moreButton, pagedList }
}

test("show more appends rows without replacing existing nodes and dedupes", async () => {
    const { browser, list, pagedList } = createList(async page =>
        page === 1
            ? {
                items: [{ id: "one", name: "One" }],
                page: 1,
                hasNext: true
            }
            : {
                items: [
                    { id: "one", name: "Duplicate" },
                    { id: "two", name: "Two" }
                ],
                page: 2,
                hasNext: false
            }
    )
    try {
        await pagedList.reload()
        const firstRow = list.children[0]
        await pagedList.loadMore()
        assert.equal(list.children.length, 2)
        assert.equal(list.children[0], firstRow)
        assert.deepEqual(pagedList.items().map(item => item.id), [
            "one",
            "two"
        ])
        assert.equal(list.getAttribute("aria-busy"), "false")
    } finally {
        browser.restore()
    }
})

test("first-page errors show retry and empty responses show the empty message", async () => {
    let fail = true
    const harness = createList(async () => {
        if (fail) {
            throw new ApiError("offline", { status: null })
        }
        return { items: [], page: 1, hasNext: false }
    })
    try {
        await harness.pagedList.reload()
        assert.match(harness.stateElement.textContent, /Could not load items/)
        assert.equal(harness.stateElement.children[1].textContent, "Try again")

        fail = false
        await harness.stateElement.children[1].click()
        assert.equal(harness.stateElement.textContent, "No items.")
        assert.equal(harness.moreButton.hidden, true)
    } finally {
        harness.browser.restore()
    }
})

test("later-page errors keep rows and allow retry", async () => {
    let failMore = true
    const harness = createList(async page => {
        if (page === 1) {
            return {
                items: [{ id: "one", name: "One" }],
                page: 1,
                hasNext: true
            }
        }
        if (failMore) {
            throw new ApiError("offline", { status: null })
        }
        return {
            items: [{ id: "two", name: "Two" }],
            page: 2,
            hasNext: false
        }
    })
    try {
        await harness.pagedList.reload()
        const row = harness.list.children[0]
        await harness.moreButton.click()
        assert.equal(harness.list.children.length, 1)
        assert.equal(harness.list.children[0], row)
        assert.equal(
            harness.stateElement.textContent,
            "Couldn't load more. Try again."
        )
        assert.equal(harness.moreButton.disabled, false)

        failMore = false
        await harness.moreButton.click()
        assert.deepEqual(harness.pagedList.items().map(item => item.id), [
            "one",
            "two"
        ])
    } finally {
        harness.browser.restore()
    }
})

test("reload aborts the previous request and snapshots can be restored", async () => {
    let firstSignal = null
    let firstRequest = true
    const harness = createList((page, signal) => {
        if (firstRequest) {
            firstRequest = false
            firstSignal = signal
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => {
                    reject(new DOMException("Aborted", "AbortError"))
                }, { once: true })
            })
        }
        return Promise.resolve({
            items: [{ id: "saved", name: "Saved" }],
            page,
            hasNext: false
        })
    })
    try {
        const oldLoad = harness.pagedList.reload()
        assert.ok(firstSignal)
        const newLoad = harness.pagedList.reload()
        assert.equal(firstSignal.aborted, true)
        await Promise.all([oldLoad, newLoad])

        const snapshot = harness.pagedList.snapshot()
        assert.deepEqual(snapshot, {
            items: [{ id: "saved", name: "Saved" }],
            page: 1,
            hasNext: false
        })
        harness.list.replaceChildren()
        harness.pagedList.restore(snapshot)
        assert.equal(harness.list.children.length, 1)
        assert.equal(harness.list.children[0].textContent, "Saved")
        assert.equal(harness.pagedList.items()[0].id, "saved")
    } finally {
        harness.browser.restore()
    }
})
