# SplitByDistance.jsx

A script that automatically **groups nearby layers together** in a composition
(e.g. a bunch of separate shapes or icons scattered across one comp) and splits
each group — each cluster of "isolated objects" — into its own new composition.

Useful when you have a single comp packed with multiple independent
icons/shapes and want to export each cluster as its own comp.

There are three detection modes.

- **Layer mode**: groups multiple *existing* layers in the comp by their position
- **Mask mode (recommended)**: treats each mask on a single image layer as one
  object. Use AE's native Auto-trace feature to generate one mask per isolated
  shape first
- **Pixel mode (experimental)**: analyzes the content of a single PNG image
  layer via Node.js, using its alpha channel or a white/black background to
  automatically detect isolated objects. For the rare case Mask mode can't
  handle — try Mask mode first

---

## Installation

Place the whole `SplitByDistance/` contents (`SplitByDistance.jsx`,
`SplitByDistance.core.js`, `detect-objects.js`, `png-decode.js`) **together**
in your After Effects Scripts folder and restart After Effects. **Only Pixel
mode needs all four files in the same folder** (the `.jsx` calls
`detect-objects.js` next to it). Layer mode and Mask mode work with just
`SplitByDistance.jsx` and `SplitByDistance.core.js`.

```
C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\
```

Run it from **File → Scripts → Run Script File…**

> To dock as a panel, place the file in `Scripts\ScriptUI Panels\` instead.

### Extra requirements for Pixel mode (experimental)

Pixel mode hands the actual image analysis off to Node.js. You'll need:

1. **Node.js installed** (from [nodejs.org](https://nodejs.org/)). Run
   `node --version` in a command prompt to check.
2. The target layer must be footage loaded from a **PNG file** (shape layers,
   text layers, precomps, JPEG/PSD, etc. are not supported).
3. In After Effects, **Preferences → Scripting & Expressions**, enable
   "**Allow Scripts to Write Files and Access Network**" (required to run the
   external command).

Layer mode and Mask mode work regardless of these — no extra install needed.

---

## How to Use

### Layer mode

1. Activate the composition containing the layers you want to split
2. (Optional) select only the layers you want to target
3. Choose "レイヤー単位" (Layer mode) as the detection mode
4. Set the gap/margin fields in the panel
5. Click **[実行]** (Run)

A new composition is created for each detected group, and that group's layers
are copied into it.

### Mask mode (auto-detect from a single image — recommended)

For splitting a single image (like the reference image — several separated
shapes in one picture) into one comp per shape:

1. Select the image layer
2. Run **Layer → Auto-trace...** from the AE menu
   - Choose "Channel: Alpha" (for a transparent background)
   - Defaults are fine for Threshold/Tolerance/Minimum Area — Auto-trace
     creates one mask per isolated shape automatically
   - Click OK
3. With that same layer selected, open `SplitByDistance.jsx`
4. Choose "マスク単位" (Mask mode) as the detection mode
5. Set the gap/margin fields
6. Click **[実行]** (Run)

A new composition is created per mask, cropped exactly to that mask's shape
(not a rectangular crop — the actual detected outline).

### Pixel mode (experimental)

1. **Select** the PNG image layer that contains multiple objects packed into
   one frame
2. Choose "ピクセル単位" (Pixel mode) as the detection mode
3. Pick a background detection method (Auto / Alpha / White / Black)
4. Set the gap/margin fields
5. Click **[実行]** (Run)

The script hands the image file to `detect-objects.js` (Node.js), which
analyzes every pixel and creates a new composition (rectangular crop) for
each cluster. This hasn't been thoroughly verified against real files yet —
if it doesn't work for you, use Mask mode instead.

---

## How grouping works

### Layer mode

For each layer, the script computes its bounding box in the comp's coordinate
space. Layers whose boxes are within the gap threshold of each other are
merged into the same group (union-find clustering). Grouping propagates
transitively — if A is close to B, and B is close to C, then A, B, and C all
end up in the same group even if A and C are far apart.

### Mask mode

For each non-inverted mask on the selected layer, the script computes a
bounding box from that mask's path vertices (masks freshly created by
Auto-trace default to mode "None" — that's expected, and their shape is still
used). In the destination comp, the relevant mask's mode is set to "Add" to
activate it, and every other mask on the copied layer is set to "None" to
disable it, so the result is clipped exactly to that mask's shape.

### Pixel mode

The selected layer's source PNG file is decoded and classified **pixel by
pixel** (no grid downsampling — edges come out accurate):

- **Alpha**: a pixel is background if its alpha is below the threshold
- **Background color (white/black/auto)**: a pixel is an object if its color
  distance from the background color exceeds the threshold

Classified pixels are connected using 8-neighbor connectivity into blobs, and
a bounding box is computed for each blob.

In all modes, the resulting boxes then go through the *same* distance-based
clustering, so boxes that are close together but not quite touching still get
merged into one group when they're within the gap threshold. Bounding boxes
are measured at the **current playhead position** at the moment you click
Run — not when the panel was opened. If your layers are animated, move the
playhead to the frame that reflects the layout you want to split before
running.

---

## Options

### Detection mode

| Option | Description |
|---|---|
| レイヤー単位 (Layer mode) | Groups multiple existing layers by their position (default) |
| マスク単位 (Mask mode) | Detects one object per mask on the selected image layer (recommended) |
| ピクセル単位 (Pixel mode) | Analyzes the content of the selected PNG layer(s) to auto-detect objects (experimental) |

### Target

| Option | Description |
|---|---|
| 選択レイヤーのみを対象にする (Selected layers only) | OFF: all layers in the comp / ON: only currently selected layers (always ON in Mask and Pixel mode) |
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

### Mask mode limitations

- The bounding box is computed from mask path **vertices only**. If a mask's
  bezier handles bulge noticeably beyond its vertices, that extra area isn't
  accounted for (rarely an issue with typical Auto-trace output).
- Inverted masks are ignored (masks with mode "None" are the normal state
  right after Auto-trace, so they are *not* ignored — their shape is used).

### Pixel mode limitations (experimental)

- Only **PNG** is supported (8-bit, non-interlaced, RGB/RGBA/Grayscale/
  GrayscaleAlpha). JPEG, PSD, indexed/palette PNG, and 16-bit PNG are not
  supported and will error out before running.
- Only works on layers whose source is a **PNG file** — shape layers, text
  layers, and precomps (which have no backing file) aren't eligible.
- Generated comps are a **rectangular crop**. No mask matching the detected
  shape is created, so **setting the margin larger than the gap threshold can
  cause part of a neighboring object to bleed into frame**. Keep the margin
  smaller than the gap.
- Requires Node.js, PNG-only input, and the AE scripting permission described
  above under "Extra requirements for Pixel mode".
- Hasn't been thoroughly verified against real-world files. If results don't
  match what you expect, try Mask mode instead.

---

## Example

### Layer mode

Given a comp full of scattered shapes/icons **already split into separate
layers**, and you want each isolated cluster exported as its own comp:

1. Activate the comp containing all the shapes
2. Set the gap larger than the space *within* a cluster, but smaller than the
   space *between* clusters
3. Click **[実行]** (Run) — one new comp is created per detected group

### Mask mode

Given the same kind of layout, but baked into **a single image layer** — say
several gemstones scattered across one picture, and you want a comp sized to
just each individual gem:

1. Select that image layer, run **Layer → Auto-trace...** (Channel: Alpha),
   click OK — this creates one mask per isolated gem automatically
2. With the same layer still selected, choose "マスク単位" (Mask mode)
3. Set the gap/margin, then click **[実行]** (Run)
4. One new comp is created per mask, cropped to that gem's exact shape
