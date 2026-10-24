import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { APP_SHELL_IDS } from "../helpers/testBrowser.mjs"

const indexHtml = await readFile(
    new URL("../../index.html", import.meta.url),
    "utf8"
)

test("HTML shell contains exactly the shared app shell ids", () => {
    const body = getBody(indexHtml)
    const ids = [...body.matchAll(/\bid="([^"]+)"/g)]
        .map(match => match[1])
    assert.deepEqual(ids, APP_SHELL_IDS)
    assert.equal(countMatches(body, /<main\b/gi), 1)
    assert.doesNotMatch(body, /<h1\b/i)
    assert.match(getOpeningTag(body, "app-bar"), /^<header\b/)
    assert.match(
        body,
        /<a id="app-home-link" class="app-bar__brand" href="#\/">Śpiewnik SpoTkanie<\/a>/
    )
    assert.match(
        getOpeningTag(body, "app-breadcrumb"),
        /^<nav\b(?=[^>]*aria-label="Breadcrumb")/
    )
    assert.match(
        getOpeningTag(body, "account-menu"),
        /\shidden(?:\s|>)/
    )
    assert.match(getOpeningTag(body, "screen"), /^<main\b/)
    assert.match(
        getOpeningTag(body, "app-status"),
        /^<div\b(?=[^>]*role="status")(?=[^>]*aria-live="polite")(?=[^>]*aria-atomic="true")/
    )
    assert.match(
        getOpeningTag(body, "app-dialog"),
        /^<dialog\b(?=[^>]*aria-labelledby="dialog-title")/
    )
    assert.match(
        body,
        /<script type="module" src="src\/main\.js"><\/script>/
    )

    const regionPositions = [
        "app-bar",
        "screen",
        "app-status",
        "app-dialog"
    ].map(id => body.indexOf(`id="${id}"`))
    assert.ok(regionPositions.every((position, index) =>
        index === 0 || regionPositions[index - 1] < position
    ))
})

test("HTML shell preserves the existing head and uses external assets", () => {
    assert.match(indexHtml, /<meta charset="utf-8">/)
    assert.match(
        indexHtml,
        /<meta name="viewport" content="width=device-width, initial-scale=1">/
    )
    assert.match(indexHtml, /<title>Śpiewnik SpoTkanie<\/title>/)
    assert.match(
        indexHtml,
        /<link rel="stylesheet" href="styles\/app\.css">/
    )
    assert.match(
        indexHtml,
        /<link rel="stylesheet" href="styles\/buttons\.css">/
    )
    assert.doesNotMatch(
        indexHtml,
        /<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script\s*>/i
    )
    assert.doesNotMatch(indexHtml, /<style\b[^>]*>[\s\S]*?<\/style\s*>/i)
    assert.doesNotMatch(indexHtml, /\sstyle\s*=/i)
    assert.doesNotMatch(indexHtml, /\son[a-z][\w:-]*\s*=/i)
})

function countMatches(value, pattern) {
    return [...value.matchAll(pattern)].length
}

function getBody(html) {
    const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
    assert.notEqual(match, null, "Missing body element")
    return match[1]
}

function getOpeningTag(html, id) {
    const match = html.match(
        new RegExp(`<[^>]+\\bid="${id}"[^>]*>`, "s")
    )
    assert.notEqual(match, null, `Missing opening tag for ${id}`)
    return match[0]
}
