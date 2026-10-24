import assert from "node:assert/strict"
import test from "node:test"

import { installTestBrowser } from "../helpers/testBrowser.mjs"

test("list and details render selected, fallback, ordered, and literal data", async () => {
    const browser = installTestBrowser(() => ({
        body: []
    }))
    const app = await import("../../src/main.js")
    await app.initialization

    app.state.songs = [
        {
            id: "song-a",
            number: null,
            title: "   ",
            author: undefined
        },
        {
            id: "song-b",
            number: "7",
            title: "Literal <strong>title</strong>",
            author: "Test author"
        }
    ]
    app.state.selectedSongId = "song-b"
    app.renderSongList()

    assert.deepEqual(browser.getSongSummaries(), [
        "Untitled song",
        "7. Literal <strong>title</strong> — Test author"
    ])

    const listItems = browser.songList.children
    assert.equal(listItems[0].className, "song-list__item")
    assert.equal(
        listItems[1].className,
        "song-list__item song-list__item--selected"
    )

    const viewButtons = browser.getButtons("View")
    assert.equal(viewButtons.length, 2)
    assert.equal(viewButtons[0].dataset.songId, "song-a")
    assert.equal(viewButtons[0].getAttribute("aria-current"), null)
    assert.equal(viewButtons[1].dataset.songId, "song-b")
    assert.equal(viewButtons[1].getAttribute("aria-current"), "true")
    assert.doesNotMatch(listItems[1].textContent, /song-b/)

    const deleteButtons = browser.getButtons("Delete")
    assert.equal(deleteButtons.length, 2)
    assert.equal(
        deleteButtons[0].getAttribute("aria-label"),
        "Delete untitled song"
    )
    assert.equal(
        deleteButtons[1].getAttribute("aria-label"),
        "Delete Literal <strong>title</strong>"
    )

    app.state.selectedSong = {
        id: "song-b",
        title: "<strong>Not markup</strong>",
        author: null,
        originalTitle: " ",
        number: undefined,
        key: "G",
        tempo: "",
        parts: [
            {
                id: "part-2",
                name: "Chorus",
                text: "Line one\nLine two"
            },
            {
                id: "part-1",
                name: null,
                text: "<em>Literal lyric</em>"
            }
        ]
    }
    app.state.isLoadingSong = false
    app.renderSongDetails()

    const detailText = browser.getElement("song-details").textContent
    const detailHeading = browser.findElements(
        element => element.className === "song-details__heading"
    )[0]
    assert.equal(detailHeading.getAttribute("tabindex"), "-1")
    assert.equal(detailHeading.dataset.songId, "song-b")
    assert.match(detailHeading.textContent, /<strong>Not markup<\/strong>/)
    assert.match(detailText, /Title<strong>Not markup<\/strong>/)
    assert.match(detailText, /AuthorNot provided/)
    assert.match(detailText, /Original titleNot provided/)
    assert.match(detailText, /NumberNot provided/)
    assert.match(detailText, /KeyG/)
    assert.match(detailText, /TempoNot provided/)
    assert.ok(detailText.indexOf("Chorus") < detailText.indexOf("Unnamed part"))
    assert.match(detailText, /Line one\nLine two/)
    assert.match(detailText, /<em>Literal lyric<\/em>/)
    assert.doesNotMatch(detailText, /song-b|part-1|part-2/)

    const partTexts = browser.findElements(
        element => element.className === "song-part__text"
    )
    assert.deepEqual(
        partTexts.map(element => element.textContent),
        ["Line one\nLine two", "<em>Literal lyric</em>"]
    )
    const editButton = browser.getButton("Edit song")
    assert.equal(editButton.dataset.action, "edit-song")
    assert.equal(
        editButton.getAttribute("aria-label"),
        "Edit <strong>Not markup</strong>"
    )
    const detailDeleteButton = browser.getButtons("Delete").at(-1)
    assert.equal(
        detailDeleteButton.getAttribute("aria-label"),
        "Delete <strong>Not markup</strong>"
    )
})
