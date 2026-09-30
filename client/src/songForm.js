import {
    isChordAnchor,
    renderChordedText
} from "./chords.js"

const SCALAR_FIELDS = [
    "title",
    "author",
    "originalTitle",
    "number",
    "key",
    "tempo"
]

export function createPartDraft(part) {
    const sourceText = part?.text ?? ""
    return {
        clientKey: crypto.randomUUID(),
        id: part?.id ?? null,
        name: part?.name ?? "",
        text: sourceText.replace(/\r\n?/g, "\n"),
        chords: (part?.chords ?? []).map(chord => ({
            offset: sourceText.slice(0, chord.offset)
                .replace(/\r\n?/g, "\n").length,
            symbol: chord.symbol
        })),
        chordsEdited: false,
        chordInput: "",
        selectedOffset: null,
        chordMessage: ""
    }
}

export function populateSongForm(form, song) {
    for (const fieldName of SCALAR_FIELDS) {
        const control = form.elements.namedItem(fieldName)
        control.value = song?.[fieldName] ?? ""
    }
}

export function buildSongPayload(form, draftParts) {
    const payload = {}

    for (const fieldName of SCALAR_FIELDS) {
        const control = form.elements.namedItem(fieldName)
        payload[fieldName] = normalizeText(control.value)
    }

    payload.parts = draftParts.map(draftPart => {
        const partPayload = {
            name: normalizeText(draftPart.name),
            text: draftPart.chords?.length > 0
                ? normalizeChordedText(draftPart.text)
                : normalizeText(draftPart.text)
        }

        if (draftPart.id !== null && draftPart.id !== undefined) {
            partPayload.id = draftPart.id
        }

        if (draftPart.chords?.length > 0 || draftPart.chordsEdited) {
            partPayload.chords = (draftPart.chords ?? []).map(chord => ({
                offset: chord.offset,
                symbol: chord.symbol.trim()
            }))
        }

        return partPayload
    })

    return payload
}

export function renderPartsEditor(container, draftParts) {
    const existing = new Map(
        Array.from(container.children, fieldset => [
            fieldset.dataset.partKey,
            fieldset
        ])
    )
    const retainedKeys = new Set()

    for (const [index, draftPart] of draftParts.entries()) {
        const fieldset = existing.get(draftPart.clientKey) ??
            createPartEditorItem(draftPart)
        retainedKeys.add(draftPart.clientKey)

        fieldset.children[0].textContent = `Part ${index + 1}`
        const nameControl = fieldset.children[1].children[1]
        const textControl = fieldset.children[2].children[1]
        if (nameControl.value !== draftPart.name) {
            nameControl.value = draftPart.name
        }
        if (textControl.value !== draftPart.text) {
            textControl.value = draftPart.text
        }
        const chordControl = fieldset.children[4].children[3].children[1]
        if (chordControl.value !== (draftPart.chordInput ?? "")) {
            chordControl.value = draftPart.chordInput ?? ""
        }
        fieldset.children[3].children[0].disabled = index === 0
        fieldset.children[3].children[1].disabled =
            index === draftParts.length - 1
        renderChordEditor(fieldset, draftPart)

        if (fieldset !== container.children[index]) {
            container.insertBefore(
                fieldset,
                container.children[index] ?? null
            )
        }
    }

    for (const [key, fieldset] of existing) {
        if (!retainedKeys.has(key)) {
            fieldset.remove()
        }
    }
}

function createPartEditorItem(draftPart) {
    const fieldset = document.createElement("fieldset")
    fieldset.className = "part-editor__item"
    fieldset.dataset.partKey = draftPart.clientKey

    const legend = document.createElement("legend")
    const nameField = createPartField({
        clientKey: draftPart.clientKey,
        fieldName: "name",
        label: "Part name",
        tagName: "input",
        value: draftPart.name
    })
    const textField = createPartField({
        clientKey: draftPart.clientKey,
        fieldName: "text",
        label: "Part text",
        tagName: "textarea",
        value: draftPart.text
    })

    const actions = document.createElement("div")
    actions.className = "part-editor__actions"
    actions.appendChild(createPartButton({
        action: "move-part-up",
        clientKey: draftPart.clientKey,
        disabled: false,
        label: "Move up"
    }))
    actions.appendChild(createPartButton({
        action: "move-part-down",
        clientKey: draftPart.clientKey,
        disabled: false,
        label: "Move down"
    }))
    actions.appendChild(createPartButton({
        action: "remove-part",
        clientKey: draftPart.clientKey,
        disabled: false,
        label: "Remove part",
        variant: "button--destructive"
    }))

    fieldset.appendChild(legend)
    fieldset.appendChild(nameField)
    fieldset.appendChild(textField)
    fieldset.appendChild(actions)
    fieldset.appendChild(createChordEditorItem(draftPart))
    return fieldset
}

function createChordEditorItem(draftPart) {
    const clientKey = draftPart.clientKey
    const section = document.createElement("section")
    section.className = "part-editor__chords"

    const heading = document.createElement("h5")
    heading.textContent = "Chords"
    const instructions = document.createElement("p")
    instructions.textContent =
        "Place the lyric cursor immediately before any character, " +
        "including a space. Enter a chord symbol and set it there."
    const target = document.createElement("p")
    target.className = "part-editor__chord-target"

    const chordField = createPartField({
        clientKey,
        fieldName: "chord",
        label: "Chord symbol",
        tagName: "input",
        value: draftPart.chordInput ?? ""
    })
    chordField.children[1].maxLength = 64
    chordField.children[1].placeholder = "e.g. Am7 or C/G"

    const actions = document.createElement("div")
    actions.className = "part-editor__chord-actions"
    actions.appendChild(createPartButton({
        action: "set-chord",
        clientKey,
        disabled: true,
        label: "Set chord"
    }))
    actions.appendChild(createPartButton({
        action: "remove-chord",
        clientKey,
        disabled: true,
        label: "Remove chord"
    }))

    const preview = document.createElement("div")
    preview.className = "part-editor__chord-preview chorded-text"
    const list = document.createElement("ul")
    list.className = "part-editor__chord-list"
    const message = document.createElement("p")
    message.className = "part-editor__chord-message"
    message.setAttribute("role", "status")
    message.setAttribute("aria-live", "polite")

    section.appendChild(heading)
    section.appendChild(instructions)
    section.appendChild(target)
    section.appendChild(chordField)
    section.appendChild(actions)
    section.appendChild(preview)
    section.appendChild(list)
    section.appendChild(message)
    return section
}

export function renderChordEditor(fieldset, draftPart) {
    const section = fieldset.children[4]
    const offset = draftPart.selectedOffset
    const selected = isChordAnchor(draftPart.text, offset)
    const current = (draftPart.chords ?? []).find(
        chord => chord.offset === offset
    )
    section.children[2].textContent = selected
        ? `Selected ${describeChordPosition(draftPart.text, offset)}.`
        : "Select a lyric character before setting a chord."
    section.children[4].children[0].disabled = !selected
    section.children[4].children[1].disabled = current === undefined

    renderChordedText(
        section.children[5],
        draftPart.text,
        draftPart.chords ?? []
    )
    const list = section.children[6]
    list.replaceChildren()
    for (const chord of draftPart.chords ?? []) {
        const item = document.createElement("li")
        const button = createPartButton({
            action: "select-chord",
            clientKey: draftPart.clientKey,
            disabled: false,
            label: `${chord.symbol} at ${describeChordPosition(
                draftPart.text,
                chord.offset
            )}`
        })
        button.dataset.offset = String(chord.offset)
        item.appendChild(button)
        list.appendChild(item)
    }
    section.children[7].textContent = draftPart.chordMessage ?? ""
}

function describeChordPosition(text, offset) {
    const prefix = text.slice(0, offset)
    const line = prefix.split(/\r\n|\r|\n/)
    const character = Array.from(line.at(-1)).length + 1
    const selected = String.fromCodePoint(text.codePointAt(offset))
    const label = selected === " "
        ? "space"
        : selected === "\t"
            ? "tab"
            : `"${selected}"`
    return `line ${line.length}, character ${character} (${label})`
}

function createPartField({
    clientKey,
    fieldName,
    label,
    tagName,
    value
}) {
    const wrapper = document.createElement("div")
    wrapper.className = "form-field"

    const controlId = `part-${fieldName}-${clientKey}`
    const fieldLabel = document.createElement("label")
    fieldLabel.setAttribute("for", controlId)
    fieldLabel.textContent = label

    const control = document.createElement(tagName)
    control.id = controlId
    control.dataset.partField = fieldName
    control.dataset.partKey = clientKey
    control.value = value

    if (tagName === "input") {
        control.type = "text"
    }

    wrapper.appendChild(fieldLabel)
    wrapper.appendChild(control)
    return wrapper
}

function createPartButton({
    action,
    clientKey,
    disabled,
    label,
    variant = "button--neutral"
}) {
    const button = document.createElement("button")
    button.className = `button ${variant}`
    button.type = "button"
    button.dataset.action = action
    button.dataset.partKey = clientKey
    button.disabled = disabled
    button.textContent = label
    return button
}

function normalizeText(value) {
    const normalizedValue = String(value ?? "").trim()
    return normalizedValue === "" ? null : normalizedValue
}

function normalizeChordedText(value) {
    const text = String(value ?? "")
    return text === "" ? null : text
}
