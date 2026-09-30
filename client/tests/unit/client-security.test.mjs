import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const sourceFiles = [
    "authApi.js",
    "httpClient.js",
    "main.js",
    "songForm.js",
    "songBooksApi.js",
    "songsApi.js"
]
const sources = new Map(await Promise.all(sourceFiles.map(async file => [
    file,
    await readFile(new URL(`../../src/${file}`, import.meta.url), "utf8")
])))

test("client keeps authentication same-origin and out of browser storage", () => {
    for (const [file, source] of sources) {
        assert.doesNotMatch(
            source,
            /localStorage|sessionStorage|localhost:7152|localhost:3000/,
            file
        )

        if (file !== "httpClient.js") {
            assert.doesNotMatch(source, /\bfetch\s*\(/, file)
        }
    }

    assert.match(sources.get("httpClient.js"), /\bfetch\s*\(/)
    assert.doesNotMatch(
        sources.get("main.js"),
        /console\.(?:log|info|warn)\s*\([^)]*(?:password|code|token)/i
    )
})
