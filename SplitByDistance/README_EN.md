# SplitByDistance.jsx

When a single image layer contains multiple isolated objects (gemstones,
icons, etc.), this script automatically **splits each one into its own
composition**.

Select the target layer and run it: AE's native Auto-trace feature opens
automatically, and once you confirm it, a new composition is created for
each detected shape, cropped exactly to that shape's outline.

---

## Installation

Place both `SplitByDistance.jsx` and `SplitByDistance.core.js` **together**
in your After Effects Scripts folder and restart After Effects.

```
C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\
```

Run it from **File → Scripts → Run Script File…**

> To dock as a panel, place the file in `Scripts\ScriptUI Panels\` instead.

---

## How to Use

1. Select the image layer containing the multiple objects
2. Open `SplitByDistance.jsx`
3. Set **Comp margin** (default 10px) and the other fields
4. Click **[実行]** (Run)
5. AE's Auto-trace dialog opens automatically — configure it and click **OK**
   (Channel: Alpha is recommended for a transparent background)
6. A new composition is created for each mask Auto-trace just created,
   cropped to that shape's outline

Clicking **Cancel** in the Auto-trace dialog creates nothing.

---

## How it works

The script compares the layer's mask count **immediately before and after**
running Auto-trace, and only processes the newly added masks (any masks that
already existed on the layer are left untouched).

For each new mask, a bounding box is computed from its path vertices (in the
layer's local coordinate space). In the destination comp, that one mask is
set to mode "Add" (activated) and every other mask on the copy is set to
"None" (disabled) — so the result is clipped exactly to that mask's shape,
not a rectangular crop.

Bounding boxes are measured at the **current playhead position** at the
moment you click Run. If your layers are animated, move the playhead to the
frame that reflects the layout you want to split before running.

---

## Options

| Option | Description |
|---|---|
| コンポの余白 (px) (Comp margin) | Padding kept around each new comp (default 10px) |
| コンプ名の接頭辞 (Comp name prefix) | Prefix for generated comp names (falls back to the active comp's name if blank) |
| 生成したコンポをフォルダにまとめる (Group into a folder) | ON (default): creates a dedicated Project panel folder for the new comps |
| 元レイヤーを削除する（移動モード） (Delete originals / move mode) | OFF (default): source comp's layers are left untouched (duplicate) / ON: originals are deleted after copying (move) |

---

## Limitations

- **Automatic Auto-trace invocation**: if the menu command can't be found or
  run, you'll get an error. In that case, run **Layer → Auto-trace...**
  manually first, then run this script again — since only *newly added*
  masks are used, that still works correctly (pre-existing masks are simply
  skipped).
- The bounding box is computed from mask path **vertices only**. If a mask's
  bezier handles bulge noticeably beyond its vertices, that extra area isn't
  accounted for (rarely an issue with typical Auto-trace output).
- Inverted masks are ignored.
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

---

## Example

Given multiple objects (say, a bunch of gemstones) packed into **a single
image layer**, and you want a comp per object:

1. Select that image layer
2. Set the margin, then click **[実行]** (Run)
3. In the Auto-trace dialog that opens, set Channel = Alpha (for a
   transparent background) etc., and click OK
4. One new comp is created per shape, cropped to that shape's outline
   (e.g. one comp per gem)
