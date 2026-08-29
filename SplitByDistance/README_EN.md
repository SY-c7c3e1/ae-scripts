# SplitByDistance.jsx

A script that automatically **groups nearby layers together** in a composition
(e.g. a bunch of separate shapes or icons scattered across one comp) and splits
each group — each cluster of "isolated objects" — into its own new composition.

Useful when you have a single comp packed with multiple independent
icons/shapes and want to export each cluster as its own comp.

There are two detection modes.

- **Layer mode**: groups multiple *existing* layers in the comp by their position
- **Pixel mode**: analyzes the content of a *single PNG image layer*, using its
  alpha channel or a white/black background to automatically detect isolated
  objects

---

## Installation

Place the whole `SplitByDistance/` contents (`SplitByDistance.jsx`,
`SplitByDistance.core.js`, `detect-objects.js`, `png-decode.js`) **together**
in your After Effects Scripts folder and restart After Effects. **Pixel mode
needs all four files in the same folder** (the `.jsx` calls
`detect-objects.js` next to it). If you only ever use Layer mode, just
`SplitByDistance.jsx` and `SplitByDistance.core.js` are enough.

```
C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\
```

Run it from **File → Scripts → Run Script File…**

> To dock as a panel, place the file in `Scripts\ScriptUI Panels\` instead.

### Extra requirements for Pixel mode

Pixel mode hands the actual image analysis off to Node.js. You'll need:

1. **Node.js installed** (from [nodejs.org](https://nodejs.org/)). Run
   `node --version` in a command prompt to check.
2. The target layer must be footage loaded from a **PNG file** (shape layers,
   text layers, precomps, JPEG/PSD, etc. are not supported).
3. In After Effects, **Preferences → Scripting & Expressions**, enable
   "**Allow Scripts to Write Files and Access Network**" (required to run the
   external command).

Layer mode works regardless of these — no extra install needed.

---

## How to Use

### Layer mode (default)

1. Activate the composition containing the layers you want to split
2. (Optional) select only the layers you want to target
3. Choose "レイヤー単位" (Layer mode) as the detection mode
4. Set the fields in the panel
5. Click **[実行]** (Run)

A new composition is created for each detected group, and that group's layers
are copied into it.

### Pixel mode (auto-detect from a single image)

1. **Select** the PNG image layer that contains multiple objects packed into
   one frame (like the reference image — several separated shapes in one
   picture)
2. Choose "ピクセル単位" (Pixel mode) as the detection mode
3. Pick a background detection method (Auto / Alpha / White / Black)
4. Set the gap/margin fields
5. Click **[実行]** (Run)

The script hands the image file to `detect-objects.js` (Node.js), which
analyzes every pixel and creates a new composition for each cluster that's
separated from the rest by transparency or background color.

---

## How grouping works

### Layer mode

For each layer, the script computes its bounding box in the comp's coordinate
space. Layers whose boxes are within the gap threshold of each other are
merged into the same group (union-find clustering). Grouping propagates
transitively — if A is close to B, and B is close to C, then A, B, and C all
end up in the same group even if A and C are far apart.

### Pixel mode

The selected layer's source PNG file is decoded and classified **pixel by
pixel** (no grid downsampling — edges come out accurate):

- **Alpha**: a pixel is background if its alpha is below the threshold
- **Background color (white/black/auto)**: a pixel is an object if its color
  distance from the background color exceeds the threshold

Classified pixels are connected using 8-neighbor connectivity into blobs, and
a bounding box is computed for each blob. Those blob boxes then go through the
*same* distance-based clustering used in layer mode, so blobs that are close
together but not quite touching still get merged into one group when they're
within the gap threshold.

In both modes, bounding boxes are measured at the **current playhead
position** at the moment you click Run — not when the panel was opened. If
your layers are animated, move the playhead to the frame that reflects the
layout you want to split before running.

---

## Options

### Detection mode

| Option | Description |
|---|---|
| レイヤー単位 (Layer mode) | Groups multiple existing layers by their position (default) |
| ピクセル単位 (Pixel mode) | Analyzes the content of the selected PNG layer(s) to auto-detect objects |

### Target

| Option | Description |
|---|---|
| 選択レイヤーのみを対象にする (Selected layers only) | OFF: all layers in the comp / ON: only currently selected layers (always ON in pixel mode) |
| 非表示レイヤーを含める (Include hidden layers) | OFF (default): layers with visibility off are excluded / ON: include them |

Null objects, guide layers, and adjustment layers are always excluded.

### Background detection (pixel mode only)

| Option | Description |
|---|---|
| 自動（おすすめ） (Auto, recommended) | Samples the image's corners — transparent → alpha-based, opaque → uses that color as background |
| アルファチャンネル (Alpha channel) | Treats transparent areas as background |
| 白背景 / 黒背景 (White / Black background) | Classifies by color distance from that color (falls back to alpha if the corners turn out to actually be transparent) |

### Split settings

| Option | Description |
|---|---|
| オブジェクト同士のすき間 (px) (Gap between objects) | Objects farther apart than this are split into separate comps (default 80px) |
| コンポの余白 (px) (Comp margin) | Padding kept around each new comp (default 40px) |

Check "詳細設定を表示" (Show advanced settings) at the bottom of the panel to
reveal these (the defaults are fine for most cases):

| Option | Description |
|---|---|
| コンプ名の接頭辞 (Comp name prefix) | Prefix for generated comp names (falls back to the active comp's name if blank) |
| 生成したコンポをフォルダにまとめる (Group into a folder) | ON (default): creates a dedicated Project panel folder for the new comps |
| 元レイヤーを削除する（移動モード） (Delete originals / move mode) | OFF (default): source comp's layers are left untouched (duplicate) / ON: originals are deleted after copying (move) |

---

## Limitations

- **3D layers** are handled with a simplified 2D approximation (X/Y position
  and Z rotation only). X/Y rotation, camera, and perspective effects are not
  accounted for — check the warning list in the completion alert and adjust
  manually if needed.
- **Parented layers**: if a copied layer still has a parent after copying,
  automatic position adjustment is skipped (and flagged as a warning). If your
  layout relies on parenting, precompose it first.
- **Expressions on Position** also disable automatic position adjustment for
  that layer.
- New comps inherit duration, frame rate, and pixel aspect ratio from the
  source comp.
- Supports Undo (Ctrl+Z) — the whole run is a single undo group.
- "Move mode" deletes layers. If in doubt, save a copy of your project first.

### Pixel mode limitations

- Only **PNG** is supported (8-bit, non-interlaced, RGB/RGBA/Grayscale/
  GrayscaleAlpha). JPEG, PSD, indexed/palette PNG, and 16-bit PNG are not
  supported and will error out before running.
- Only works on layers whose source is a **PNG file** — shape layers, text
  layers, and precomps (which have no backing file) aren't eligible.
- Generated comps are a **rectangular crop**. No mask matching the detected
  shape is created, so **setting the margin larger than the gap threshold can
  cause part of a neighboring object to bleed into frame**. Keep the margin
  smaller than the gap.
- Detection scans every pixel (no grid approximation, unlike the earlier grid
  -based version), so edges come out accurate. Very large images (several
  thousand pixels per side) may take a few seconds to analyze.
- Requires Node.js, PNG-only input, and the AE scripting permission described
  above under "Extra requirements for Pixel mode".

---

## Example

### Layer mode

Given a comp full of scattered shapes/icons **already split into separate
layers**, and you want each isolated cluster exported as its own comp:

1. Activate the comp containing all the shapes
2. Set the gap threshold larger than the space *within* a cluster, but
   smaller than the space *between* clusters
3. Click **[実行]** (Run) — one new comp is created per detected group

### Pixel mode

Given the same kind of layout, but baked into **a single PNG image layer** —
say a circle and a square in one picture, and you want a comp sized to just
the circle and another sized to just the square:

1. Make sure Node.js is installed and the AE scripting permission is enabled
2. Select that image layer
3. Choose "ピクセル単位" (Pixel mode) and pick a background detection method
   (e.g. Auto)
4. Set the gap/margin, then click **[実行]** (Run)
5. Once analysis finishes, a new comp is created for each detected object
