# AE Scripts

A collection of free After Effects scripts for motion design and live concert visuals.

## Requirements

- Adobe After Effects 2026 (v26)
- Windows 11

> Tested on my own environment only. Compatibility with other versions or systems is not guaranteed.

## Scripts

| Script | Description |
|---|---|
| [MarkerCopy](./MarkerCopy/) | Copy & paste markers between layers and compositions |
| [SplitByDistance](./SplitByDistance/) | Group scattered layers by proximity and split each cluster into its own composition |

## Installation

1. Download the `.jsx` file from each script folder
2. Place it in your After Effects Scripts folder:
   ```
   C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\
   ```
3. In After Effects: **File → Scripts → Run Script File…**

> To dock as a panel, place the file in the `Scripts\ScriptUI Panels\` folder and restart After Effects.

## Testing

ロジックはAEを起動せずにNode.jsでテストできる（詳細は [`testing/README.md`](./testing/README.md)）。

```bash
npm test
```

新しいスクリプトを追加する際は、UI(`.jsx`)とロジック(`.core.js`)を分離しておくと
`__tests__/` にテストを追加しやすい。`MarkerCopy/` が実例。

## License

Free to use for personal and commercial projects.
Please do not redistribute or resell.

## Bug Reports & Requests

If you find a bug or have a feature request, please open an [Issue](../../issues).
Any feedback is welcome!

## Disclaimer

These scripts are provided as-is, without any warranty.
Use at your own risk.
