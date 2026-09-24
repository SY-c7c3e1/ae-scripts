// ReferenceViewer.host.jsx
// Reference Viewer パネルから evalScript で呼ばれる AE 側の処理。
//
// ・データ（一覧・メモのJSON文字列）はプロジェクトの XMP メタデータに保存する。
//   .aep の中に入るので、プロジェクトを開けば復元され、収集・コピーしても消えない。
//   拡張を入れていない人が開いても何も起きない（見えないだけ）。
// ・ExtendScript には JSON が無いので、JSONの解釈はパネル側で行い、
//   ここでは文字列をそのまま出し入れするだけにしている。
// ・日本語や改行を安全に受け渡すため、やり取りする文字列は encodeURIComponent 済み。
// ・戻り値でエラーを伝えるときは "ERR:" で始まる文字列を返す。

var RV_NS = "http://ns.c7-ae-scripts/ReferenceViewer/1.0/";
var RV_PREFIX = "c7rv";
var RV_PROP = "data";

function rv_initXmp() {
    if (typeof XMPMeta === "undefined") {
        ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    XMPMeta.registerNamespace(RV_NS, RV_PREFIX);
}

function rv_projectXmp() {
    rv_initXmp();
    var packet = app.project.xmpPacket;
    return packet ? new XMPMeta(packet) : new XMPMeta();
}

// 現在のプロジェクトのファイルパス（未保存なら ""）
function rv_projectPath() {
    try {
        var f = app.project.file;
        return f ? encodeURIComponent(f.fsName) : "";
    } catch (e) {
        return "ERR:" + e.toString();
    }
}

function rv_readData() {
    try {
        var xmp = rv_projectXmp();
        var prop = xmp.getProperty(RV_NS, RV_PROP);
        return prop ? encodeURIComponent(prop.value) : "";
    } catch (e) {
        return "ERR:" + e.toString();
    }
}

function rv_writeData(encoded) {
    try {
        var xmp = rv_projectXmp();
        xmp.setProperty(RV_NS, RV_PROP, decodeURIComponent(encoded));
        app.project.xmpPacket = xmp.serialize();
        return "OK";
    } catch (e) {
        return "ERR:" + e.toString();
    }
}

// ファイル選択ダイアログ（複数選択可）。選ばれたパスを改行区切りで返す
function rv_selectFiles() {
    try {
        var files = File.openDialog("リファレンスに追加するファイルを選択", undefined, true);
        if (!files) return "";
        if (!(files instanceof Array)) files = [files];
        var out = [];
        for (var i = 0; i < files.length; i++) out.push(files[i].fsName);
        return encodeURIComponent(out.join("\n"));
    } catch (e) {
        return "ERR:" + e.toString();
    }
}

// 改行区切りのパスそれぞれが存在するか。"1" / "0" を並べた文字列を返す
function rv_exists(encodedList) {
    try {
        var list = decodeURIComponent(encodedList).split("\n");
        var out = "";
        for (var i = 0; i < list.length; i++) {
            out += (list[i] && new File(list[i]).exists) ? "1" : "0";
        }
        return out;
    } catch (e) {
        return "ERR:" + e.toString();
    }
}

// 関連付けられたアプリで開く
function rv_openFile(encodedPath) {
    try {
        var f = new File(decodeURIComponent(encodedPath));
        if (!f.exists) return "ERR:ファイルが見つかりません";
        return f.execute() ? "OK" : "ERR:開けませんでした";
    } catch (e) {
        return "ERR:" + e.toString();
    }
}

// ファイルのあるフォルダを開く
function rv_revealFile(encodedPath) {
    try {
        var f = new File(decodeURIComponent(encodedPath));
        var folder = f.parent;
        if (!folder || !folder.exists) return "ERR:フォルダが見つかりません";
        return folder.execute() ? "OK" : "ERR:開けませんでした";
    } catch (e) {
        return "ERR:" + e.toString();
    }
}
