# SplitByDistance.jsx

A script that automatically **groups nearby layers together** in a composition
(e.g. a bunch of separate shapes or icons scattered across one comp) and splits
each group — each cluster of "isolated objects" — into its own new composition.

Useful when you have a single comp packed with multiple independent
icons/shapes and want to export each cluster as its own comp.

There are two detection modes.

- **Layer mode**: groups multiple *existing* layers in the comp by their position
- **Pixel mode**: analyzes the content of a *single image layer*, using its alpha
  channel or a white/black background to automatically detect isolated objects

---

## Installation

Place `SplitByDistance.jsx` in your After Effects Scripts folder and restart After Effects.

```
C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\
```

Run it from **File → Scripts → Run Script File…**

> To dock as a panel, place the file in `Scripts\ScriptUI Panels\` instead.

---

## How to Use

### Layer mode (default)

1. Activate the composition containing the layers you want to split
2. (Optional) select only the layers you want to target
3. Choose "レイヤー単位" (Layer mode) as the detection mode
4. Set **Threshold** / **Margin** and the other options in the panel
5. Click **[実行]** (Run)

A new composition is created for each detected group, and that group's layers
are copied into it.

### Pixel mode (auto-detect from a single image)

1. **Select** the image layer that contains multiple objects packed into one
   frame (like the reference image — several separated shapes in one picture)
2. Choose "ピクセル単位" (Pixel mode) as the detection mode
3. Pick a background detection method (Auto / Alpha / White / Black)
4. Set **Threshold** / **Margin** and the other options
5. Click **[実行]** (Run) — analysis can take anywhere from a few seconds to a
   few minutes depending on image size and grid interval

The script samples the image content on a grid and creates a new composition
for each cluster of pixels that's separated from the rest by transparency or
background color.

---

## How grouping works

### Layer mode

For each layer, the script computes its bounding box in the comp's coordinate
space. Layers whose boxes are within **Threshold** pixels of each other are
merged into the same group (union-find clustering). Grouping propagates
transitively — if A is close to B, and B is close to C, then A, B, and C all
end up in the same group even if A and C are far apart.

### Pixel mode

The selected layer's content is sampled on a grid (using `layer.sampleImage`)
at the interval you specify, and each cell is classified as background or
object:

- **Alpha**: a cell is background if its alpha is below the threshold
- **Background color (white/black/auto)**: a cell is an object if its color
  distance from the background color exceeds the threshold

Classified cells are connected using 8-neighbor connectivity (union-find) into
blobs, and a bounding box is computed for each blob. Those blob boxes then go
through the *same* distance-based clustering used in layer mode, so blobs that
are close together on the grid but not quite touching still get merged into
one group when they're within **Threshold**.

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
| ピクセル単位 (Pixel mode) | Analyzes the content of the selected image layer(s) to auto-detect objects |

### Target

| Option | Description |
|---|---|
| 選択レイヤーのみを対象にする (Selected layers only) | OFF: all layers in the comp / ON: only currently selected layers (always ON in pixel mode) |
| 非表示レイヤーを含める (Include hidden layers) | OFF (default): layers with visibility off are excluded / ON: include them |

Null objects, guide layers, and adjustment layers are always excluded.

### Pixel detection settings (pixel mode only)

| Option | Description |
|---|---|
| 背景の判定方法 (Background detection) | Auto (default) / Alpha channel / White background / Black background |
| 解析グリッド間隔 (px) (Analysis grid interval) | Sampling grid spacing (default 8px). Smaller = more precise but slower |

"Auto" samples the corners of the layer's bounds — if they're transparent it
uses alpha-based detection, otherwise it uses that sampled color as the
background for color-based detection.

### Split settings

| Option | Description |
|---|---|
| しきい値 (px) (Threshold) | Layers within this distance are merged into the same group (default 80px) |
| 余白 (px) (Margin) | Padding added around each new comp's bounding box (default 40px) |
| コンプ名の接頭辞 (Comp name prefix) | Prefix for generated comp names (falls back to the active comp's name if blank) |
| 生成したコンポをフォルダにまとめる (Group into a folder) | ON (default): creates a dedicated Project panel folder for the new comps |

### Other

| Option | Description |
|---|---|
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

- Detection is an **approximation based on grid sampling** — lines or elements
  thinner than the grid interval may be missed or come out with a jagged
  outline. Lower the grid interval for more precision (at the cost of speed).
- Generated comps are a **rectangular crop**. No mask matching the detected
  shape is created, so **setting the margin larger than the threshold can
  cause part of a neighboring object to bleed into frame**. Keep the margin
  smaller than the threshold.
- A high sample count means slower processing (anywhere from a few seconds to
  a few minutes depending on image size and grid interval). The estimated
  sample count is shown before running, as a rough guide.
- Background detection samples the selected layer alone via
  `layer.sampleImage()` — it reflects that layer's own content (post-effects),
  not how it composites with other layers.
- This feature hasn't been thoroughly tested against real-world files. If
  results don't match what you expect, try a different background detection
  method or grid interval.

---

## Example

### Layer mode

Given a comp full of scattered shapes/icons **already split into separate
layers**, and you want each isolated cluster exported as its own comp:

1. Activate the comp containing all the shapes
2. Set the threshold larger than the gap *within* a cluster, but smaller than
   the gap *between* clusters
3. Click **[実行]** (Run) — one new comp is created per detected group

### Pixel mode

Given the same kind of layout, but baked into **a single image layer**:

1. Select that image layer
2. Choose "ピクセル単位" (Pixel mode) and pick a background detection method
   (e.g. Auto)
3. Set threshold, margin, and grid interval, then click **[実行]** (Run)
4. Once analysis finishes, a new comp is created for each detected cluster
