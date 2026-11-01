import assert from "node:assert/strict"
import test from "node:test"
import { compareSongSnapshots } from "../../src/historyCompare.js"

const before = { title: "Before", key: "Am", author: "", parts: [
    { id: "a", name: "Verse", text: "same\r\n😀old\nend", chords: [{ offset: 6, symbol: "C" }] },
    { id: "b", name: "Chorus", text: "<script>", chords: [] },
    { id: "removed", text: "gone", chords: [{ offset: 0, symbol: "D" }] }
] }
const after = { title: "<img onerror=x>", key: "D", author: null, parts: [
    { ...before.parts[1] },
    { id: "a", name: "Renamed", text: "same\r\n😀new\nend", chords: [{ offset: 6, symbol: "G" }] },
    { id: "added", name: "Bridge", text: "new\nline", chords: [{ offset: 0, symbol: "Am" }] }
] }

test("comparison groups friendly detail and part changes without exposing part IDs", () => {
    const result = compareSongSnapshots(before, after)
    assert.deepEqual(result, compareSongSnapshots(before, after))
    assert.deepEqual(result.fields, [
        { key: "title", label: "Title", before: "Before", after: "<img onerror=x>" },
        { key: "key", label: "Key", before: "Am", after: "D" }
    ])
    assert.deepEqual(result.parts.map(part => [part.name, part.status]), [
        ["Chorus", "changed"], ["Part 3", "removed"], ["Renamed", "changed"], ["Bridge", "added"]
    ])
    const verse = result.parts[2]
    assert.equal(verse.previousName, "Verse")
    assert.equal(verse.previousPosition, 1)
    assert.equal(verse.position, 2)
    assert.equal(result.parts[0].rows.length, 0)
    assert.deepEqual(result.parts[3].rows.map(row => [row.kind, row.text]), [["added", "new"], ["added", "line"]])
    assert.deepEqual(result.parts[1].rows[0].chords, [{ offset: 0, symbol: "D", changed: false }])
    assert.equal(result.unchangedParts.length, 0)
    assert.deepEqual(compareSongSnapshots(before, before), { fields: [], parts: [], unchangedParts: ["Verse", "Chorus", "Part 3"], hasChanges: false })
})

test("changed lines are paired with highlighted lyric spans and line-relative chords", () => {
    const verse = compareSongSnapshots(before, after).parts[2]
    assert.deepEqual(verse.rows.map(row => [row.kind, row.text]), [
        ["same", "same"], ["removed", "😀old"], ["added", "😀new"], ["same", "end"]
    ])
    const [removed, added] = verse.rows.slice(1, 3)
    assert.deepEqual(removed.marks, [[2, 5]])
    assert.deepEqual(added.marks, [[2, 5]])
    assert.deepEqual(removed.chords, [{ offset: 0, symbol: "C", changed: true }])
    assert.deepEqual(added.chords, [{ offset: 0, symbol: "G", changed: true }])
})

test("text edits shift chord positions without flagging unchanged chords, and keep surrogate pairs whole", () => {
    const old = { parts: [{ id: "p", text: "ABBA 😀OJCZE", chords: [{ offset: 0, symbol: "C" }, { offset: 5, symbol: "a7" }] }] }
    const edited = { parts: [{ id: "p", text: "BBA 😁OJCZE", chords: [{ offset: 0, symbol: "C" }, { offset: 4, symbol: "a7" }] }] }
    const [removed, added] = compareSongSnapshots(old, edited).parts[0].rows
    assert.deepEqual(removed.marks, [[0, 7]])
    assert.deepEqual(added.marks, [[0, 6]])
    assert.deepEqual(added.chords.map(chord => chord.changed), [true, true])

    const insertOnly = { parts: [{ id: "p", text: "xx ABBA", chords: [{ offset: 3, symbol: "C" }] }] }
    const base = { parts: [{ id: "p", text: "ABBA", chords: [{ offset: 0, symbol: "C" }] }] }
    const rows = compareSongSnapshots(base, insertOnly).parts[0].rows
    assert.deepEqual(rows[1].marks, [[0, 3]])
    assert.equal(rows[0].marks.length, 0)
    assert.equal(rows[1].chords[0].changed, false)
})

test("inserted lines are aligned instead of marking the rest of the part as changed", () => {
    const old = { parts: [{ id: "p", name: "Verse", text: "one\ntwo\nthree\nfour", chords: [] }] }
    const edited = { parts: [{ id: "p", name: "Verse", text: "one\nnew\ntwo\nthree\nfour!", chords: [] }] }
    const rows = compareSongSnapshots(old, edited).parts[0].rows
    assert.deepEqual(rows.map(row => [row.kind, row.text]), [
        ["same", "one"], ["added", "new"], ["same", "two"], ["same", "three"], ["removed", "four"], ["added", "four!"]
    ])
    assert.deepEqual(rows[5].marks, [[4, 5]])
})
