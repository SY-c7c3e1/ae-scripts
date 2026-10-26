// C7_ProjectSetup.jsx
// 新規プロジェクトの初期セットアップ。
//   1. フォルダを作成: ♪ / 00_OUT preview / 01_Data in / 02_Comp / 03_format / footage
//   2. プロジェクト内の音源（.mp3 / .wav）を探し、曲の長さに合わせた「♪」コンプ
//      （4x4px・30fps）を作って音源を入れ、♪フォルダにまとめて開く
//      ・Projectパネルで音源を1つだけ選択していれば、それを優先
//      ・音源がなければ 9000秒 の「♪」コンプを作る
//
// 旧ファイル名: setting_comp_sy_v2.jsx（Script_for_AEpanel/02comp_set から移動）
// 移動時の修正: プロジェクトの最後のアイテムが音源判定から漏れていた不具合を修正

(function () {
    if (!app.project) {
        alert("プロジェクトを開いてください。");
        return;
    }

    var musicItem = null;
    var compDur = 9000;

    app.beginUndoGroup("Project Setup");

    // 既存アイテムを先に調べる（この後作るフォルダは対象外）
    var items = app.project.items;
    for (var i = 1; i <= items.length; i++) {
        var item = items[i];
        var name = item.name.toLowerCase();
        if (name.indexOf(".mp3") !== -1 || name.indexOf(".wav") !== -1) {
            musicItem = item;
            compDur = item.duration;
            if (item.selected && app.project.selection.length === 1) {
                break;
            }
        }
    }

    var compFolder = app.project.items.addFolder("\u266A");
    app.project.items.addFolder("00_OUT preview");
    app.project.items.addFolder("01_Data in");
    app.project.items.addFolder("02_Comp");
    app.project.items.addFolder("03_format");
    app.project.items.addFolder("footage");

    var musicComp = app.project.items.addComp("\u266A", 4, 4, 1, compDur, 30);
    if (musicItem) {
        musicComp.parentFolder = compFolder;
        musicItem.parentFolder = compFolder;
        musicComp.layers.add(musicItem);
    }

    musicComp.openInViewer();

    app.endUndoGroup();
})();
