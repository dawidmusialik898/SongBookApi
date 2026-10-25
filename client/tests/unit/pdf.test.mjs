import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../../src/httpClient.js"
import {
    downloadPdf,
    pdfDownloadName,
    readPdfMetadata
} from "../../src/ui/pdf.js"

const METADATA = {
    id: "pdf/one",
    includeChords: true,
    isWholeBook: true,
    songCount: 2,
    selectedSongs: [],
    generatedAtUtc: "2026-10-20T12:34:00Z",
    isOutdated: false
}

test("PDF metadata validation accepts complete values and rejects malformed values", () => {
    assert.equal(readPdfMetadata(METADATA), METADATA)
    for (const invalid of [
        null,
        { ...METADATA, id: " " },
        { ...METADATA, includeChords: "true" },
        { ...METADATA, songCount: -1 },
        {
            ...METADATA,
            selectedSongs: [{ id: "song", title: null }]
        },
        { ...METADATA, generatedAtUtc: "not a date" },
        { ...METADATA, isOutdated: 0 }
    ]) {
        assert.throws(() => readPdfMetadata(invalid), ApiError)
    }
})

test("PDF filenames sanitize book names and IDs and include the PDF variant", () => {
    assert.equal(
        pdfDownloadName("Safe / Name.", METADATA),
        "Safe _ Name-chords-pdf_one.pdf"
    )
    assert.equal(
        pdfDownloadName("", {
            ...METADATA,
            id: "☃",
            includeChords: false
        }),
        "song-book-lyrics-_.pdf"
    )
})

test("PDF download rejects empty, non-Blob, and unsupported Blob values", async () => {
    for (const blob of [
        null,
        new Blob([], { type: "application/pdf" }),
        new Blob(["not a PDF"], { type: "text/plain" })
    ]) {
        await assert.rejects(
            downloadPdf(blob, "Book", METADATA),
            error => error instanceof ApiError &&
                error.message === "The API returned an invalid PDF file."
        )
    }
})
