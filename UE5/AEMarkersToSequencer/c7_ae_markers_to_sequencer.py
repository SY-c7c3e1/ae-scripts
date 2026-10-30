# c7_ae_markers_to_sequencer.py
# AE の「マーカーをCSV書き出し」で作った CSV を、UE5 の Sequencer のマーカー
# （Marked Frames）として、いま開いている Level Sequence に追加する。
#
# 使い方：
#   1. Edit > Plugins で「Python Editor Script Plugin」を有効にしておく（初回だけ）
#   2. 対象の Level Sequence を Sequencer で開いておく
#   3. Tools > Execute Python Script… でこのファイルを選ぶ
#   4. CSV を選ぶ画面が出るので、書き出した *_markers.csv を選ぶ
#
# 位置の合わせ方：
#   AE のコンポの頭 ＝ シーケンスの再生範囲の開始（Playback Start）。
#   CSV の Seconds 列（コンポの頭からの秒数）を、シーケンスのフレームレートで
#   フレームに直して置くので、AE と UE のフレームレートが違ってもずれない。
#
# ラベルはコメント（コメントが空のマーカーは Name 列の M001 など）。
# 同じ位置・同じラベルのマーカーがすでにあればスキップするので、2回実行しても増えない。
# Ctrl+Z で元に戻せる。

import csv
import os
import glob
from fractions import Fraction

# ── 設定（必要なら書き換える） ──
CSV_PATH = ""              # 空なら選ぶ画面を出す（出せないときはデスクトップの最新 *_markers.csv）
CLEAR_EXISTING = False     # True にすると、追加の前にシーケンスの既存マーカーを全部消す
OFFSET_FRAMES = 0          # さらにずらしたいときのフレーム数（シーケンスのフレームレート基準）
# Source 列ごとの色（Comp マーカーとレイヤーマーカーで色を分ける）
COLOR_COMP = (1.0, 0.75, 0.2, 1.0)
COLOR_LAYER = (0.55, 0.75, 1.0, 1.0)


# ── UE に依存しない部分（テスト可能） ──
def read_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    if rows and "Seconds" not in rows[0]:
        raise ValueError("この CSV には Seconds 列がありません。AE の「マーカーをCSV書き出し」で作った CSV を選んでください。")
    return rows


def to_display_frame(seconds, display_fps):
    """秒 → シーケンスのフレーム番号（四捨五入）"""
    return int((Fraction(str(seconds)) * display_fps + Fraction(1, 2)) // 1)


def display_to_tick(display_frame, display_fps, tick_res):
    """シーケンスのフレーム番号 → 内部の tick（Marked Frame はこの単位で持つ）"""
    return int(Fraction(display_frame) * tick_res / display_fps)


def build_markers(rows, display_fps, tick_res, start_display_frame, offset=0):
    out = []
    for r in rows:
        f = to_display_frame(r["Seconds"], display_fps) + start_display_frame + offset
        label = (r.get("Comment") or "").strip() or (r.get("Name") or "").strip()
        src = (r.get("Source") or "").strip()
        out.append({
            "display_frame": f,
            "tick": display_to_tick(f, display_fps, tick_res),
            "label": label,
            "is_comp": src == "Comp",
        })
    return out


def pick_csv():
    if CSV_PATH:
        return CSV_PATH
    try:
        import tkinter
        from tkinter import filedialog
        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        path = filedialog.askopenfilename(
            title="AE のマーカー CSV を選択",
            initialdir=os.path.join(os.path.expanduser("~"), "Desktop"),
            filetypes=[("CSV", "*.csv")],
        )
        root.destroy()
        return path
    except Exception:
        found = glob.glob(os.path.join(os.path.expanduser("~"), "Desktop", "*_markers.csv"))
        return max(found, key=os.path.getmtime) if found else ""


# ── UE 側 ──
def main():
    import unreal

    seq = unreal.LevelSequenceEditorBlueprintLibrary.get_current_level_sequence()
    if seq is None:
        unreal.EditorDialog.show_message("AE Markers", "Level Sequence を Sequencer で開いてから実行してください。",
                                         unreal.AppMsgType.OK)
        return

    path = pick_csv()
    if not path:
        unreal.log_warning("[AE Markers] CSV が選ばれなかったので中止しました。")
        return

    rows = read_rows(path)
    dr = seq.get_display_rate()
    tr = seq.get_tick_resolution()
    display_fps = Fraction(dr.numerator, dr.denominator)
    tick_res = Fraction(tr.numerator, tr.denominator)
    start = seq.get_playback_start()

    markers = build_markers(rows, display_fps, tick_res, start, OFFSET_FRAMES)

    added = skipped = 0
    with unreal.ScopedEditorTransaction("AE マーカーを追加"):
        if CLEAR_EXISTING:
            seq.delete_marked_frames()
        existing = set()
        for mf in seq.get_marked_frames():
            existing.add((mf.get_editor_property("frame_number").value, mf.get_editor_property("label")))

        for m in markers:
            key = (m["tick"], m["label"])
            if key in existing:
                skipped += 1
                continue
            mf = unreal.MovieSceneMarkedFrame()
            mf.set_editor_property("frame_number", unreal.FrameNumber(m["tick"]))
            mf.set_editor_property("label", m["label"])
            try:
                c = COLOR_COMP if m["is_comp"] else COLOR_LAYER
                mf.set_editor_property("color", unreal.LinearColor(*c))
            except Exception:
                pass  # 色を持たないバージョンでは無視
            seq.add_marked_frame(mf)
            existing.add(key)
            added += 1

    unreal.LevelSequenceEditorBlueprintLibrary.refresh_current_level_sequence()
    msg = "{} 個のマーカーを追加しました（重複スキップ {} 個）\nシーケンス: {} / {} fps\nCSV: {}".format(
        added, skipped, seq.get_name(), float(display_fps), os.path.basename(path))
    unreal.log("[AE Markers] " + msg.replace("\n", " / "))
    unreal.EditorDialog.show_message("AE Markers", msg, unreal.AppMsgType.OK)


if __name__ == "__main__":
    main()
