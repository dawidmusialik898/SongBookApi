import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../../src/httpClient.js"
import {
    fetchAvailablePage,
    pageUrl,
    readPage
} from "../../src/pagination.js"

test("pagination validates page numbers and response shapes", () => {
    assert.equal(pageUrl("/songbooks", 1), "/songbooks")
    assert.equal(pageUrl("/songbooks", 2), "/songbooks?page=2")
    assert.throws(() => pageUrl("/songbooks", 0), TypeError)
    assert.throws(() => pageUrl("/songbooks", 1.5), TypeError)

    const valid = { items: [{ id: "song" }], page: 2, hasNext: false }
    assert.equal(readPage(valid, 2), valid)
    for (const invalid of [
        [],
        null,
        { ...valid, page: 1 },
        { ...valid, hasNext: "false" },
        { ...valid, items: Array(51).fill({}) },
        { ...valid, items: [], hasNext: true }
    ]) {
        assert.throws(() => readPage(invalid, 2), ApiError)
    }
})

test("an empty last page falls back once to its predecessor", async () => {
    const requested = []
    const result = await fetchAvailablePage(page => {
        requested.push(page)
        return {
            items: page === 2 ? [] : [{ id: "remaining" }],
            page,
            hasNext: false
        }
    }, 2)

    assert.deepEqual(requested, [2, 1])
    assert.equal(result.page, 1)
    assert.equal(result.items[0].id, "remaining")
})
