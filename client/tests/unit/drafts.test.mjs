import assert from "node:assert/strict"
import test from "node:test"

import {
    createDraftKey,
    createDrafts
} from "../../src/drafts.js"

test("draft keys distinguish new songs from existing songs", () => {
    assert.equal(createDraftKey("book-1"), "book-1/new")
    assert.equal(createDraftKey("book-1", "song-2"), "book-1/song-2")
    assert.throws(() => createDraftKey(" "), /Song book id/)
    assert.throws(() => createDraftKey("book-1", " "), /Song id/)
})

test("drafts are owned by one normalized account at a time", () => {
    const drafts = createDrafts()
    const first = { title: "First" }
    const second = { title: "Second" }

    drafts.set("Owner@Example.com", "book-1/new", first)
    drafts.set("owner@example.com", "book-1/song-1", second)
    assert.equal(drafts.owner, "owner@example.com")
    assert.equal(drafts.get("book-1/new"), first)
    assert.equal(drafts.get("book-1/song-1"), second)

    drafts.set("other@example.com", "book-1/new", { title: "Other" })
    assert.equal(drafts.owner, "other@example.com")
    assert.equal(drafts.get("book-1/song-1"), null)
    assert.equal(drafts.size(), 1)
})

test("clear and owner changes remove drafts, while deleting the last resets owner", () => {
    const drafts = createDrafts()
    drafts.set("owner@example.com", "book-1/new", { title: "Unsaved" })

    drafts.clearIfOwnerChanged("OWNER@example.com")
    assert.equal(drafts.hasAny(), true)
    drafts.clearIfOwnerChanged("reader@example.com")
    assert.equal(drafts.hasAny(), false)
    assert.equal(drafts.owner, null)

    drafts.set("reader@example.com", "book-1/song-1", { title: "Draft" })
    drafts.delete("book-1/song-1")
    assert.equal(drafts.owner, null)
    drafts.set("owner@example.com", "book-1/new", { title: "Draft" })
    drafts.clear()
    assert.equal(drafts.size(), 0)
    assert.equal(drafts.owner, null)
})
