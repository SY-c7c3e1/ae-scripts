# SplitByDistance.jsx

A script that automatically **groups nearby layers together** in a composition
(e.g. a bunch of separate shapes or icons scattered across one comp) and splits
each group — each cluster of "isolated objects" — into its own new composition.

Useful when you have a single comp packed with multiple independent
icons/shapes and want to export each cluster as its own comp.

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

1. Activate the composition containing the layers you want to split
2. (Optional) select only the layers you want to target
3. Set **Threshold** / **Margin** and the other options in the panel
4. Click **[実行]** (Run)

A new composition is created for each detected group, and that group's layers
are copied into it.

---

## How grouping works

For each layer, the script computes its bounding box in the comp's coordinate
space. Layers whose boxes are within **Threshold** pixels of each other are
merged into the same group (union-find clustering). Grouping propagates
transitively — if A is close to B, and B is close to C, then A, B, and C all
end up in the same group even if A and C are far apart.

Bounding boxes are measured at the **current playhead position** at the moment
you click Run — not when the panel was opened. If your layers are animated,
move the playhead to the frame that reflects the layout you want to split
before running.

---

## Options

### Target

| Option | Description |
|---|---|
| 選択レイヤーのみを対象にする (Selected layers only) | OFF: all layers in the comp / ON: only currently selected layers |
| 非表示レイヤーを含める (Include hidden layers) | OFF (default): layers with visibility off are excluded / ON: include them |

Null objects, guide layers, and adjustment layers are always excluded.

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

---

## Example

Given a comp full of scattered shapes/icons like the reference image, and you
want each isolated cluster exported as its own comp:

1. Activate the comp containing all the shapes
2. Set the threshold larger than the gap *within* a cluster, but smaller than
   the gap *between* clusters
3. Click **[実行]** (Run) — one new comp is created per detected group
