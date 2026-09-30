import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const indexHtml = await readFile(
    new URL("../../index.html", import.meta.url),
    "utf8"
)
const appCss = await readFile(
    new URL("../../styles/app.css", import.meta.url),
    "utf8"
)
const buttonsCss = await readFile(
    new URL("../../styles/buttons.css", import.meta.url),
    "utf8"
)

const requiredIds = [
    "new-song-book-button",
    "refresh-song-books-button",
    "song-book-list",
    "song-book-list-state",
    "song-book-form",
    "song-book-form-heading",
    "song-book-name",
    "cancel-song-book-button",
    "save-song-book-button",
    "selected-song-book-heading",
    "rename-song-book-button",
    "delete-song-book-button",
    "song-book-access-panel",
    "song-book-access-list",
    "song-book-access-form",
    "song-book-access-email",
    "song-book-access-level",
    "save-song-book-access-button",
    "new-song-button",
    "refresh-songs-button",
    "app-status",
    "auth-summary",
    "show-login-button",
    "show-register-button",
    "logout-button",
    "auth-panel",
    "auth-panel-heading",
    "close-auth-panel-button",
    "login-form",
    "login-email",
    "login-password",
    "login-remember-me",
    "register-form",
    "register-email",
    "register-password",
    "register-confirm-password",
    "resend-confirmation-form",
    "forgot-password-form",
    "reset-password-form",
    "reset-password-email",
    "reset-password-code",
    "reset-password-new-password",
    "reset-password-confirm-password",
    "write-access-message",
    "song-list-heading",
    "song-list-state",
    "song-list",
    "song-details",
    "song-form",
    "song-form-heading",
    "song-title",
    "song-author",
    "song-original-title",
    "song-number",
    "song-key",
    "song-tempo",
    "parts-editor",
    "add-part-button",
    "song-form-status",
    "cancel-song-button",
    "save-song-button"
]

test("HTML shell contains each stable region exactly once", () => {
    assert.equal(countMatches(indexHtml, /<h1\b/gi), 1)
    assert.equal(countMatches(indexHtml, /<main\b/gi), 1)

    for (const id of requiredIds) {
        assert.equal(
            countMatches(indexHtml, new RegExp(`id="${id}"`, "g")),
            1,
            `${id} should occur exactly once`
        )
    }

    assert.match(
        indexHtml,
        /<p[^>]*id="app-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/s
    )
    assert.match(
        getOpeningTag(indexHtml, "song-list-heading"),
        /\stabindex="-1"/
    )
    assert.match(
        indexHtml,
        /<ul[^>]*id="song-list"[^>]*>/s
    )
    assert.match(
        getOpeningTag(indexHtml, "new-song-button"),
        /\shidden(?:\s|>)/
    )
    assert.match(
        getOpeningTag(indexHtml, "song-form"),
        /\shidden(?:\s|>)/
    )
    assert.match(
        indexHtml,
        /<script type="module" src="src\/main\.js"><\/script>/
    )
})

test("future form controls have labels and safe button types", () => {
    const labelledInputs = [
        ["song-book-name", "name"],
        ["song-book-access-email", "email"],
        ["song-title", "title"],
        ["song-author", "author"],
        ["song-original-title", "originalTitle"],
        ["song-number", "number"],
        ["song-key", "key"],
        ["song-tempo", "tempo"]
    ]

    for (const [id, name] of labelledInputs) {
        assert.match(
            indexHtml,
            new RegExp(`<label\\s+for="${id}"`),
            `${id} should have a label`
        )
        assert.match(
            getOpeningTag(indexHtml, id),
            new RegExp(`\\sname="${name}"`)
        )
    }

    assert.match(
        indexHtml,
        /<label\s+for="song-book-access-level"/
    )
    assert.match(
        getOpeningTag(indexHtml, "song-book-access-level"),
        /\sname="accessLevel"/
    )

    assert.match(
        getOpeningTag(indexHtml, "cancel-song-book-button"),
        /\stype="button"/
    )
    assert.match(
        getOpeningTag(indexHtml, "save-song-book-button"),
        /\stype="submit"/
    )
    assert.match(
        getOpeningTag(indexHtml, "add-part-button"),
        /\stype="button"/
    )
    assert.match(
        getOpeningTag(indexHtml, "cancel-song-button"),
        /\stype="button"/
    )
    assert.match(
        getOpeningTag(indexHtml, "save-song-button"),
        /\stype="submit"/
    )
    assert.match(
        indexHtml,
        /id="song-form-status"[\s\S]*class="form-actions"/
    )
    assert.doesNotMatch(indexHtml, /\sonclick=/i)
    assert.doesNotMatch(indexHtml, /\stabindex="[1-9]/i)
    assert.match(
        getOpeningTag(indexHtml, "song-book-name"),
        /\smaxlength="100"/
    )

    for (const id of [
        "song-title",
        "song-author",
        "song-original-title",
        "song-number",
        "song-key",
        "song-tempo"
    ]) {
        assert.doesNotMatch(getOpeningTag(indexHtml, id), /\smaxlength=/i)
    }
})

test("authentication forms are semantic and use safe autocomplete", () => {
    const autocompleteInputs = [
        ["login-email", "username"],
        ["login-password", "current-password"],
        ["register-email", "username"],
        ["register-password", "new-password"],
        ["register-confirm-password", "new-password"],
        ["reset-password-email", "username"],
        ["reset-password-new-password", "new-password"],
        ["reset-password-confirm-password", "new-password"]
    ]

    for (const [id, autocomplete] of autocompleteInputs) {
        assert.match(indexHtml, new RegExp(`<label\\s+for="${id}"`))
        assert.match(
            getOpeningTag(indexHtml, id),
            new RegExp(`\\sautocomplete="${autocomplete}"`)
        )
    }

    assert.match(
        getOpeningTag(indexHtml, "reset-password-code"),
        /\stype="hidden"/
    )
    assert.doesNotMatch(indexHtml, /localStorage|sessionStorage/)
})

test("styles provide responsive, notice, selected, and button hooks", () => {
    assert.match(appCss, /grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    assert.match(appCss, /@media \(min-width:\s*48rem\)/)
    assert.match(appCss, /width:\s*calc\(100% - 2rem\)/)
    assert.match(appCss, /max-width:\s*100%/)
    assert.match(appCss, /\.notice--error/)
    assert.match(appCss, /\.notice--success/)
    assert.match(appCss, /\.song-list__item--selected/)
    assert.match(appCss, /\.song-book-list__item--selected/)
    assert.match(appCss, /\.song-book-access-list/)
    assert.match(appCss, /\.song-list__actions/)
    assert.match(
        appCss,
        /\.song-part__text\s*\{[^}]*white-space:\s*pre-wrap/s
    )
    assert.match(appCss, /\.part-editor__item/)
    assert.match(appCss, /\.part-editor__actions/)
    assert.match(appCss, /:focus-visible/)
    assert.match(appCss, /min-height:\s*2\.75rem/)
    assert.match(appCss, /\.form-status/)

    assert.match(buttonsCss, /\.button--neutral/)
    assert.match(buttonsCss, /\.button--primary/)
    assert.match(buttonsCss, /\.button--destructive/)
    assert.match(buttonsCss, /min-width:\s*2\.75rem/)
    assert.doesNotMatch(buttonsCss, /688px/)
})

function countMatches(value, pattern) {
    return [...value.matchAll(pattern)].length
}

function getOpeningTag(html, id) {
    const match = html.match(
        new RegExp(`<[^>]+id="${id}"[^>]*>`, "s")
    )
    assert.notEqual(match, null, `Missing opening tag for ${id}`)
    return match[0]
}
