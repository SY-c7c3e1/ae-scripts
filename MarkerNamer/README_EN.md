# C7_MarkerNamer.jsx (English)

A dockable panel for naming layer markers on an audio layer with one click per marker, with built-in marker copy & paste (formerly MarkerCopy).
Built for live-visual cue naming such as `01_intro`, `02_1A`, `03_1B` ...

---

## Installation

Place **all three** files — `C7_MarkerNamer.jsx`, `MarkerNamer.core.js` and `MarkerCopy.core.js` — in the following folder and restart After Effects:

```
C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\
```

Open it from **Window → C7_MarkerNamer.jsx** (dockable).

> The panel fails to load if either `.core.js` file is missing from the same folder.

---

## Usage

1. Select the audio layer
2. Put the playhead on the first marker
3. Click `intro` → `A` → `B` → `C` → `A` ... following the song structure

Each click names the current marker and moves the playhead to the next one.

| Button | Action |
|---|---|
| Name buttons (intro / A–E / Theme ... / atk) | Name the current marker, then go to the next |
| Free text + [付ける] | Apply the typed name, then go to the next |
| [◀ 前] / [スキップ ▶] | Move to the previous / next marker without naming |
| [消去] | Clear the current marker's name |
| [連番振り直し] | Renumber only (e.g. after editing names by hand) |

"Current marker" = the marker at the playhead, or the nearest one before it.

---

## Numbering rules

- `01_`, `02_` ... are reassigned in time order every time a name is applied
- Unnamed markers are not counted
- `atk` is applied without a number
- Inserting or clearing a name renumbers everything after it

---

## A–E buttons (automatic verse/chorus round)

A, B and C get the round number automatically. The panel looks at the last name like `2B` **before** the current marker:

- Pressed letter comes later (C after B) → same round (`2C`)
- Same or earlier letter (A after C, C after C) → next round (`3A`, `3C`)
- Nothing before → round 1 (`1A`)

Example: A → B → C → A → B → C → D → C gives `1A 1B 1C 2A 2B 2C D 3C`.

- D and E are applied as-is (`D`, `E`)
- Each button shows the name it would apply at the current position (e.g. `2A`)
- After moving the playhead in the timeline, hover over the panel to refresh the labels

---

## Marker Copy (formerly MarkerCopy)

The "マーカーコピー" section at the bottom copies and pastes markers clipboard-style,
between layer markers and comp markers, or across compositions.

| Action | Layer(s) selected | Nothing selected |
|---|---|---|
| **[Copy]** | Markers of the layer(s) (merged when several) | Comp markers |
| **[Paste]** | To the layer(s) | To comp markers |

The clipboard is kept until the panel is closed.

### Options

- **現在位置にペースト (Paste at playhead)** — shift so the first marker lands on the playhead (OFF: original times)
- **既存マーカーを保持 (Keep existing)** — append to existing markers (OFF: replace them)
- **レイヤーのイン点をオフセットに使う (Use layer in-point offset)** — times relative to each layer's start (OFF: absolute comp time)

Copied fields: comment, duration, chapter, URL, frame target, cue point name, label.

---

## Customization

Edit the top of `C7_MarkerNamer.jsx`:

```js
var PRESETS  = ["intro", "A", "B", "C", "D", "E", "Theme", "Kanso", "outro", "atk"]; // buttons
var SECTION_LETTERS = ["A", "B", "C", "D", "E"];  // section buttons
var OPTS     = {
    noNumber:     ["atk"],          // names without the 01_ prefix (e.g. add "break")
    digits:       2,                // digits of the number prefix
    roundLetters: ["A", "B", "C"]   // sections that get a round number (D, E stay as-is)
};
```

---

## Notes

- Works on the selected layer's markers (the topmost one if several are selected)
- Marker color, duration and other fields are preserved
- Supports Undo (Ctrl+Z)
