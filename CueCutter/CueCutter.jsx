// ============================================================
// CueCutter.jsx
// ♪レイヤーのコメント付きマーカーごとに選択レイヤーを
// プリコンポして分割するスクリプト
//
// 動作仕様:
//   ① アクティブコンポに「♪」を含むレイヤーがあり、
//      コメント付きマーカーが存在する場合に動作
//   ② 選択レイヤー全体をプリコンポし、
//      コメント付きマーカーの数だけコンポを複製して配置
//   ③ 各コンポには♪レイヤーを含む全選択レイヤーが入る
//   ④ コンポの尺 = マーカー時刻の1秒前 〜 次のマーカー時刻の3秒後
//      （最後のマーカーは♪レイヤーのoutPointの3秒後）
//   ⑤ コンポ名 = マーカーのコメントと同じ
//   ⑥ メインコンポに元レイヤーのコピーを残す
// ============================================================

(function () {

var activeComp = app.project.activeItem;
var M_flag = 0;

if (activeComp && activeComp instanceof CompItem) {

    var selectedLayers_pre = activeComp.selectedLayers;

    if (selectedLayers_pre.length > 0) {

        var pre_markerLayer = SearchMLayer(selectedLayers_pre);

        if (M_flag === 0) {
            alert("選択したレイヤーに♪レイヤーが含まれていません。");
        } else if (M_flag === 1) {
            alert("選択したレイヤーにコメント付きマーカーを持つ♪レイヤーが含まれていません。");
        } else {
            app.beginUndoGroup("Cue_cutter_v2");

            // メインコンポに元レイヤーのコピーを残す
            ScopyLayer(selectedLayers_pre);

            // 選択中（複製された）レイヤーのインデックスを取得
            var layerIndexs = InputIndex(activeComp.selectedLayers);

            // マーカー情報を取得
            var Markers = getCommentMarkers(pre_markerLayer);

            // プリコンポ＆分割配置
            preComp(layerIndexs, Markers, pre_markerLayer);

            app.endUndoGroup();
        }

    } else {
        alert("選択したレイヤーがありません。");
    }
} else {
    alert("有効なコンポが開かれていません。");
}


// ============================================================
// メインコンポに元レイヤーのコピーを残す（元選択は解除）
// ============================================================
function ScopyLayer(selectedLayers_pre) {
    for (var i = 0; i < selectedLayers_pre.length; i++) {
        var original = selectedLayers_pre[i];
        var copied = original.duplicate();
        original.selected = false;
        copied.selected = true;
        copied.moveToEnd();
    }
}


// ============================================================
// 選択レイヤーのインデックス配列を返す
// ============================================================
function InputIndex(selectedLayers) {
    var temp = [];
    for (var i = 0; i < selectedLayers.length; i++) {
        temp.push(selectedLayers[i].index);
    }
    return temp;
}


// ============================================================
// ♪レイヤーを探してM_flagをセットし返す
// ============================================================
function SearchMLayer(selectedLayers) {
    var MLayer;
    for (var i = 0; i < selectedLayers.length; i++) {
        var layer = selectedLayers[i];
        if (layer.name.indexOf("♪") !== -1) {
            MLayer = layer;
            var markerProp = MLayer.property("Marker");
            // コメント付きマーカーが1つでもあるか確認
            var hasComment = false;
            for (var k = 1; k <= markerProp.numKeys; k++) {
                if (markerProp.keyValue(k).comment !== "") {
                    hasComment = true;
                    break;
                }
            }
            if (hasComment) {
                M_flag = 2;
                break;
            } else {
                M_flag = 1;
            }
        }
    }
    return MLayer;
}


// ============================================================
// コメント付きマーカーを時刻順で取得
// 戻り値: [{comment, from}, ...]
// ============================================================
function getCommentMarkers(layer) {
    var result = [];
    var markerProp = layer.property("Marker");
    for (var i = 1; i <= markerProp.numKeys; i++) {
        var t = markerProp.keyTime(i);
        var comment = markerProp.keyValue(i).comment;
        if (comment !== null && comment !== "") {
            result.push({ comment: comment, from: t });
        }
    }
    // 念のため時刻順にソート
    result.sort(function (a, b) { return a.from - b.from; });
    return result;
}


// ============================================================
// プリコンポ → 複製 → 尺調整 → 配置
// ============================================================
function preComp(layerIndexs, Markers, pre_markerLayer) {

    var PRE_OFFSET  = 1.0; // マーカーの何秒前から
    var POST_OFFSET = 3.0; // 次のマーカー（または終端）の何秒後まで

    var PreComps = [];

    // 元コンポの設定を保存（フレームレート・解像度・ピクセル比・背景色）
    var srcFps     = activeComp.frameRate;
    var srcWidth   = activeComp.width;
    var srcHeight  = activeComp.height;
    var srcPixelAR = activeComp.pixelAspect;
    var srcBgColor = activeComp.bgColor;

    // 選択レイヤーをプリコンポ（"プリコンポーズ"は仮名、後で上書き）
    var pcomp = activeComp.layers.precompose(layerIndexs, "プリコンポーズ", true);

    // precomposeするとメインコンポにプリコンレイヤーが残るので削除
    activeComp.layer(activeComp.numLayers).remove();

    // 元コンポの設定をプリコンに反映
    pcomp.frameRate   = srcFps;
    pcomp.width       = srcWidth;
    pcomp.height      = srcHeight;
    pcomp.pixelAspect = srcPixelAR;
    pcomp.bgColor     = srcBgColor;

    // プリコン内で♪レイヤーが何番目か調べる
    var music_index_in_pcomp = 0;
    for (var i = 1; i <= pcomp.numLayers; i++) {
        if (pcomp.layer(i).name.indexOf("♪") !== -1) {
            music_index_in_pcomp = i;
            break;
        }
    }

    // マーカー数だけコンポを用意（1個目はpcomp本体、以降は複製）
    PreComps.push(pcomp);
    for (var i = 1; i < Markers.length; i++) {
        var dup = pcomp.duplicate();
        PreComps.push(dup);
    }

    // 各コンポの名前・尺を設定してメインコンポに配置
    for (var i = 0; i < Markers.length; i++) {

        var markerTime = Markers[i].from;

        // コンポの開始・終了（メイン上の絶対時刻）
        var rangeStart = markerTime - PRE_OFFSET;
        var rangeEnd;
        if (i === Markers.length - 1) {
            // 最後のマーカー → ♪レイヤーのoutPointの10秒後
            rangeEnd = pre_markerLayer.outPoint + 10;
        } else {
            // 次のマーカー時刻の3秒後
            rangeEnd = Markers[i + 1].from + POST_OFFSET;
        }

        // コンポの尺
        var compDuration = rangeEnd - rangeStart;
        if (compDuration <= 0) { compDuration = POST_OFFSET + PRE_OFFSET; }

        // コンポ設定
        PreComps[i].name = Markers[i].comment;
        PreComps[i].duration = compDuration;

        // メインコンポにレイヤーとして追加
        var newLayer = activeComp.layers.add(PreComps[i]);

        // ♪レイヤーの直後（下）に配置
        newLayer.moveAfter(activeComp.layer(pre_markerLayer.index));

        // メインコンポ上の開始位置
        newLayer.startTime = rangeStart;

        // プリコン内の♪レイヤーの表示範囲を調整
        // プリコン内は時刻0基準なので、オフセットを計算
        if (music_index_in_pcomp > 0) {
            var ml = PreComps[i].layer(music_index_in_pcomp);
            // inPoint/outPoint はコンポ内の絶対時刻
            ml.inPoint  = markerTime - PRE_OFFSET;   // コンポ内の開始
            ml.outPoint = rangeEnd - rangeStart + (markerTime - PRE_OFFSET); // コンポ内の終了
            // startTimeを使ってコンポ内のオフセットを合わせる
            // （元スクリプトと同じ方式）
            ml.startTime = -rangeStart;
        }
    }
}

})();
