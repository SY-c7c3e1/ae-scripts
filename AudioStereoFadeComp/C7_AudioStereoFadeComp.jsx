// C7_AudioStereoFadeComp.jsx
//
// 使い方：
//   1. プロジェクトパネルで音源（音声ファイルのフッテージ）を1つ以上選択
//   2. スクリプトを実行
//
// 実行内容（選択した音源1つにつき）：
//   ・音源の長さに合わせた新規コンポジションを作成し、音源をレイヤーとして追加
//   ・そのレイヤーに「ステレオミキサー」エフェクトを適用
//   ・Left Level を 100%→0%、Right Pan を 100%→0% にキーフレームでフェード
//     （0秒地点で100%、レイヤー末尾で0%の2点のみ）
//
// AEの表示言語（英語版/日本語版）に関わらず動作するように、
// エフェクトは表示名ではなくmatchName（"ADBE Aud Stereo Mixer"）で追加している。
// エフェクト内の各パラメータも、表示名は言語によって変わるため、
// パラメータ自身のmatchName（実機で確認済み）でアクセスする。
//
// ロジック本体は AudioStereoFadeComp.core.js に分離している（Node上でのテスト対象はそちら）。

#include "AudioStereoFadeComp.core.js"

(function () {

    var STEREO_MIXER_MATCH_NAME    = "ADBE Aud Stereo Mixer";
    var LEFT_LEVEL_MATCH_NAME      = "ADBE Aud Stereo Mixer-0001";
    var RIGHT_PAN_MATCH_NAME       = "ADBE Aud Stereo Mixer-0004";

    var selectedItems = app.project.selection;
    if (!selectedItems || selectedItems.length === 0) {
        alert("プロジェクトパネルで音源（音声ファイル）を選択してください。");
        return;
    }

    var audioItems = AudioStereoFadeCompCore.filterAudioOnlyItems(selectedItems);
    if (audioItems.length === 0) {
        alert("選択中のアイテムに音声ファイルが見つかりませんでした。\n（映像入りのファイルは対象外です）");
        return;
    }

    app.beginUndoGroup("Audio to Comp + Stereo Mixer Fade");

    var createdNames = [];

    try {
        for (var i = 0; i < audioItems.length; i++) {
            var audioItem = audioItems[i];
            var params = AudioStereoFadeCompCore.buildCompParams(audioItem);

            var comp = app.project.items.addComp(
                params.name,
                params.width,
                params.height,
                params.pixelAspect,
                params.duration,
                params.frameRate
            );

            if (audioItem.parentFolder && audioItem.parentFolder !== app.project.rootFolder) {
                comp.parentFolder = audioItem.parentFolder;
            }

            var layer = comp.layers.add(audioItem);

            var stereoMixer = layer.property("ADBE Effect Parade").addProperty(STEREO_MIXER_MATCH_NAME);
            var leftLevel   = stereoMixer.property(LEFT_LEVEL_MATCH_NAME);
            var rightPan    = stereoMixer.property(RIGHT_PAN_MATCH_NAME);

            var keyframes = AudioStereoFadeCompCore.buildFadeKeyframes(params.duration);
            for (var k = 0; k < keyframes.length; k++) {
                leftLevel.setValueAtTime(keyframes[k].time, keyframes[k].value);
                rightPan.setValueAtTime(keyframes[k].time, keyframes[k].value);
            }

            createdNames.push(comp.name);
        }
    } catch (e) {
        app.endUndoGroup();
        alert("エラーが発生しました:\n" + e.toString());
        return;
    }

    app.endUndoGroup();

    alert(
        "完了！\n" +
        createdNames.length + " 個のコンポジションを作成しました。\n" +
        "・" + createdNames.join("\n・") + "\n\n" +
        "各コンポの音源レイヤーに Stereo Mixer を適用し、\n" +
        "Left Level / Right Pan を 100%→0% でフェードしました。"
    );

})();
