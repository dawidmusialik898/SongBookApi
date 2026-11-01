import { ApiError } from "../httpClient.js"
import { later } from "./dom.js"
import { displayValue } from "./format.js"

export function readPdfMetadata(pdf) {
    // Older saved-export fixtures omit customization metadata.
    const options = {
        fontFamily: pdf?.fontFamily === undefined ? "lato" : pdf.fontFamily,
        fontSize: pdf?.fontSize === undefined ? 10 : pdf.fontSize,
        orientation: pdf?.orientation === undefined ? "portrait" : pdf.orientation,
        columns: pdf?.columns === undefined ? 1 : pdf.columns
    }
    if (
        pdf === null ||
        typeof pdf !== "object" ||
        typeof pdf.id !== "string" ||
        pdf.id.trim() === "" ||
        typeof pdf.includeChords !== "boolean" ||
        typeof pdf.isWholeBook !== "boolean" ||
        !Number.isSafeInteger(pdf.songCount) ||
        pdf.songCount < 0 ||
        !Array.isArray(pdf.selectedSongs) ||
        !pdf.selectedSongs.every(song =>
            song !== null &&
            typeof song === "object" &&
            typeof song.id === "string" &&
            typeof song.title === "string"
        ) ||
        typeof pdf.generatedAtUtc !== "string" ||
        Number.isNaN(Date.parse(pdf.generatedAtUtc)) ||
        typeof pdf.isOutdated !== "boolean" ||
        Object.keys(pdfOptionErrors(options)).length !== 0
    ) {
        throw new ApiError("The API returned invalid PDF metadata.")
    }

    return { ...pdf, ...options }
}

export function pdfOptionErrors({ fontFamily, fontSize, orientation, columns }) {
    const errors = {}
    if (!["lato", "dejavu-sans-mono"].includes(fontFamily)) {
        errors.fontFamily = "Choose Lato or DejaVu Sans Mono."
    }
    if (!Number.isInteger(fontSize) || fontSize < 8 || fontSize > 18) {
        errors.fontSize = "Choose an integer font size from 8 to 18."
    }
    if (!["portrait", "landscape"].includes(orientation)) {
        errors.orientation = "Choose portrait or landscape."
    }
    if (!Number.isInteger(columns) || columns < 1 ||
        columns > (orientation === "landscape" ? 3 : 2)) {
        errors.columns = "Choose 1-2 columns for portrait or 1-3 for landscape."
    }
    return errors
}

export function pdfDownloadName(bookName, pdf) {
    const metadata = readPdfMetadata(pdf)
    const safeBookName = displayValue(bookName, "song-book")
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
        .replace(/[. ]+$/g, "")
        .slice(0, 80) || "song-book"
    const variant = metadata.includeChords ? "chords" : "lyrics"
    const safeId = metadata.id.replace(/[^\w-]/g, "_").slice(0, 64)
    return `${safeBookName}-${variant}-${safeId || "export"}.pdf`
}

export async function downloadPdf(blob, bookName, pdf) {
    const metadata = readPdfMetadata(pdf)
    if (
        typeof Blob === "undefined" ||
        !(blob instanceof Blob) ||
        blob.size === 0 ||
        (
            blob.type !== "" &&
            !["application/pdf", "application/octet-stream"].includes(
                blob.type.split(";")[0]
            )
        )
    ) {
        throw new ApiError("The API returned an invalid PDF file.")
    }

    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", objectUrl)
    link.setAttribute("download", pdfDownloadName(bookName, metadata))
    try {
        document.body.appendChild(link)
        await link.click()
    } finally {
        link.remove()
        later(() => URL.revokeObjectURL(objectUrl), 1000)
    }

    return true
}
