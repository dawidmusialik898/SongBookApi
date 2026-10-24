import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const sourceRoot = fileURLToPath(
    new URL("../../src/", import.meta.url)
)
const sourceFiles = await findJavaScriptFiles(sourceRoot)
const sources = new Map(await Promise.all(sourceFiles.map(async file => [
    relative(sourceRoot, file).split(sep).join("/"),
    await readFile(file, "utf8")
])))
const html = await readFile(
    new URL("../../index.html", import.meta.url),
    "utf8"
)

test("client keeps authentication same-origin and out of browser storage", () => {
    assert.ok(sources.size > 0, "expected JavaScript source files")

    for (const [file, source] of sources) {
        assert.doesNotMatch(
            source,
            /localStorage|sessionStorage|localhost:7152|localhost:3000/,
            file
        )

        if (file !== "httpClient.js") {
            assert.doesNotMatch(source, /\bfetch\s*\(/, file)
        }

        assert.doesNotMatch(
            source,
            /console\.(?:log|info|warn)\s*\([^)]*(?:password|code|token)/i,
            file
        )
    }

    assert.match(sources.get("httpClient.js"), /\bfetch\s*\(/)
})

test("client source renders user content without HTML-writing APIs", () => {
    for (const [file, source] of sources) {
        assert.doesNotMatch(
            source,
            /\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|document\s*\.\s*write\s*\(|\bsetAttribute\s*\(\s*["']style["']/i,
            file
        )
    }
})

test("HTML shell has no inline scripts, styles, or event handlers", () => {
    assert.doesNotMatch(
        html,
        /<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script\s*>/i
    )
    assert.doesNotMatch(html, /<style\b[^>]*>[\s\S]*?<\/style\s*>/i)
    assert.doesNotMatch(html, /\sstyle\s*=/i)
    assert.doesNotMatch(html, /\son[a-z][\w:-]*\s*=/i)
})

async function findJavaScriptFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
            files.push(...await findJavaScriptFiles(path))
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(path)
        }
    }

    return files.sort()
}
