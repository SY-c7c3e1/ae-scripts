# MarkerCopy.jsx

A clipboard-style marker copy & paste tool for After Effects.
Copy markers from layers or compositions and paste them anywhere — even across different compositions.

---

## Installation

Place `MarkerCopy.jsx` in your After Effects Scripts folder and restart After Effects.

```
C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\
```

Run it from **File → Scripts → Run Script File…**

> To dock as a panel, place the file in `Scripts\ScriptUI Panels\` instead.

---

## How to Use

Just two steps: **Copy → Paste**

### Step 1 — Copy

| Source | How |
|---|---|
| Layer markers | Select the layer(s) and click **[Copy]** |
| Comp markers | Deselect all layers and click **[Copy]** |
| Multiple layers | Select multiple layers and click **[Copy]** (markers are merged) |

Once copied, the clipboard panel shows the source name and marker count.
The clipboard is retained until the panel is closed.

### Step 2 — Paste

| Destination | How |
|---|---|
| Layer markers | Select the target layer(s) and click **[Paste]** |
| Comp markers | Deselect all layers and click **[Paste]** |
| Multiple layers at once | Select multiple layers and click **[Paste]** |

Switch to a different composition and paste to copy markers across comps.

---

## Options

### Paste at Current Position
Shifts all markers so the **first marker lands on the playhead**.

- **OFF (default)** — Paste at the original absolute time
- **ON** — Paste relative to the current playhead position

Useful when reusing the same marker pattern at a different point in the timeline.

### Keep Existing Markers
- **OFF (default)** — Clears existing markers before pasting (overwrite)
- **ON** — Adds markers on top of existing ones (append)

### Use Layer In-Point as Offset
- **OFF (default)** — Uses absolute composition time
- **ON** — Uses time relative to the layer's in-point. Handy for looping layers where you want the layer start treated as time 0.

---

## Examples

### Layer markers → Comp markers
1. Select the layer with markers → **[Copy]**
2. Deselect all layers → **[Paste]**

### Comp markers → Another comp
1. In the source comp (no layer selected) → **[Copy]**
2. Switch to the destination comp
3. (No layer selected) → **[Paste]**

### Duplicate layer markers within the same comp
1. Select the source layer → **[Copy]**
2. Select the target layer → **[Paste]**

### Paste from playhead position
1. Copy markers
2. Move the playhead to where you want the first marker
3. Check **"Paste at Current Position"** → **[Paste]**

---

## Notes

- Copied marker data includes: comment, duration, chapter, URL, frame target, cue point name, label
- The clipboard resets when the panel is closed
- Supports Undo (Ctrl+Z)

---
