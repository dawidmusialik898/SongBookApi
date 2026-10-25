import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../../src/httpClient.js"
import {
    pageUrl,
    readPage
} from "../../src/pagination.js"

test("pagination validates page numbers and response shapes", () => {
    assert.equal(pageUrl("/songbooks", 1), "/songbooks")
    assert.equal(pageUrl("/songbooks", 2), "/songbooks?page=2")
    assert.equal(
        pageUrl("/songbooks", 3, {
            search: "polish & folk",
            query: "two words",
            empty: "",
            missing: undefined,
            absent: null
        }),
        "/songbooks?page=3&search=polish+%26+folk&query=two+words"
    )
    assert.equal(
        pageUrl("/songbooks", 1, { limit: 0 }),
        "/songbooks?limit=0"
    )
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
