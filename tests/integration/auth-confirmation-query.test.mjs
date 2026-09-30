import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("confirmation result is announced and removed from history", async () => {
    const browser = installTestBrowser(
        () => ({ body: [] }),
        {
            initialUrl:
                "https://localhost/?auth=confirmed&unrelated=kept",
            authHandler: () => ({
                body: {
                    isAuthenticated: false,
                    email: null
                }
            })
        }
    )

    const app = await import("../../src/main.js")
    await app.initialization

    assert.equal(browser.location.search, "?unrelated=kept")
    assert.equal(
        browser.getElement("app-status").textContent,
        "Email confirmed. You can now sign in."
    )
    assert.equal(
        browser.getElement("app-status").getAttribute("role"),
        "status"
    )
})
