//DESCRIPTION: Object Nudge v.1.0.9 - Move, resize and duplicate objects with precise spacing and baseline increments
/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided "as is", without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/

#target "InDesign"
#targetengine "FrameNudge"   // Keep the palette alive between script calls

// ==== Labels (Nudge / UI) ====
var LABEL_AMOUNT_KEY      = "FrameNudge.amount";
var LABEL_DIR_KEY         = "FrameNudge.direction";    // "up" | "down" | "left" | "right" | "all"
var LABEL_MODE_KEY        = "FrameNudge.mode";         // "grow" | "move" | "duplicate"
var LABEL_PRESETS_KEY     = "FrameNudge.presets";      // Saved distances (6 slots, separated by "||")

var NUM_PRESETS = 6;

// ==== Globals for the palette UI ====
var w;
var mode = "grow";        // "grow" | "move" | "duplicate"
var direction = "up";     // "up" | "down" | "left" | "right" | "all"
var amountEdit;
var rbModeGrow, rbModeMove, rbModeDup, rbAll;
var presetEdits = [];

// ==== Helpers ====
function getDoc() {
    if (!app.documents.length) throw new Error("No document is open.");
    return app.activeDocument;
}

function getSelectionFramesFlexible() {
    if (!app.selection || !app.selection.length) return [];
    var out = [];
    function pushUnique(it){
        if (!it) return;
        if (!it.hasOwnProperty("geometricBounds")) return;
        if (isNaN(it.geometricBounds[0])) return;
        if (it.locked || (it.itemLayer && it.itemLayer.locked)) return;
        for (var k=0;k<out.length;k++) if (out[k] === it) return;
        out.push(it);
    }
    for (var i = 0; i < app.selection.length; i++) {
        var it = app.selection[i];
        if (it && it.hasOwnProperty("geometricBounds")) {
            pushUnique(it);
            continue;
        }
        try {
            if (it && it.hasOwnProperty("parentTextFrames")) {
                var ptf = it.parentTextFrames;
                if (ptf && ptf.length) pushUnique(ptf[0]);
            }
        } catch (_) {}
        try {
            if (it && it.hasOwnProperty("allPageItems")) {
                var kids = it.allPageItems;
                for (var j=0;j<kids.length;j++){
                    if (kids[j] && kids[j].hasOwnProperty("geometricBounds")) pushUnique(kids[j]);
                }
            }
        } catch (_) {}
    }
    return out;
}

function readLabel(doc, key, fallback) {
    try {
        var v = doc.extractLabel(key);
        return (v !== null && v !== "") ? v : fallback;
    } catch (_) {
        return fallback;
    }
}
function writeLabel(doc, key, val) {
    try { doc.insertLabel(key, String(val)); } catch (_) {}
}

function unitForDoc(doc) {
    var mu = String(doc.viewPreferences.horizontalMeasurementUnits);
    if (/MILLIMETERS/.test(mu)) return "mm";
    if (/CENTIMETERS/.test(mu)) return "cm";
    if (/INCHES/.test(mu))      return "in";
    if (/POINTS/.test(mu))      return "pt";
    if (/PICAS/.test(mu))       return "pica";
    if (/PIXELS/.test(mu))      return "px";
    return "mm";
}
function safeTrim(s) { s = String(s); return s.replace(/^\s+|\s+$/g, ""); }

// Convert to document units, including F/B baseline-step units.
// Examples: "8", "8 mm", "2,5 mm", "0.3 in", "12 pt", "2F", "1,5B".
function toDocUnitsNumber(input, doc) {
    if (input === null || input === undefined) throw new Error("No value provided.");
    var s = safeTrim(input);
    if (!s) throw new Error("The value is empty.");

    // Convert decimal commas to periods and remove whitespace
    s = s.replace(/,/g, ".").replace(/\s+/g, "");

    // --- F/B units: number of baseline steps ---
    var mFB = s.match(/^([-+]?\d*\.?\d+)([fFbB])$/);
    if (mFB) {
        var lines = parseFloat(mFB[1]);
        if (isNaN(lines)) throw new Error("Invalid F/B value: " + input);
        var baselineStep = Number(doc.gridPreferences.baselineDivision); // Already in document units
        return lines * baselineStep;
    }

    // Standard units
    var unit = unitForDoc(doc);
    var hasLetters = /[a-zA-Z]/.test(s);
    if (hasLetters) {
        var uv = new UnitValue(s);
        var v  = uv.as(unit);
        if (isNaN(v)) throw new Error("Invalid measurement: " + input);
        return v;
    } else {
        var n = parseFloat(s);
        if (isNaN(n)) throw new Error("Invalid measurement: " + input);
        return n;
    }
}

// Read baseline grid settings and format the information label
function getBaselineInfo(doc) {
    var unit = unitForDoc(doc);                  // e.g. "mm"
    var bdInUnit = Number(doc.gridPreferences.baselineDivision); // Already in document units

    var uvUnit = unit;
    if (unit === "pica") uvUnit = "pc";

    var bdPt;
    try {
        bdPt = Number(UnitValue(bdInUnit + " " + uvUnit).as("pt"));
    } catch (e) {
        bdPt = Number(bdInUnit);
        uvUnit = "pt";
    }

    function fmt(num, dec){
        return (Math.round(num*Math.pow(10,dec))/Math.pow(10,dec))
               .toFixed(dec);
    }

    var decUnit = (unit === "mm") ? 3 : 2;

    return "Baseline grid: " + fmt(bdPt, 2) + " pt  \u2022  " +
           fmt(bdInUnit, decUnit) + " " + unit;
}

function readPresets(doc) {
    var raw = readLabel(doc, LABEL_PRESETS_KEY, "");
    if (!raw) return [];
    return raw.split("||");
}

// === Actions: Nudge ===
function growOneSide(item, d, dir) {
    var gb = item.geometricBounds.slice(0); // [y1,x1,y2,x2]
    if (dir === "up")         gb[0] -= d;
    else if (dir === "down")  gb[2] += d;
    else if (dir === "left")  gb[1] -= d;
    else if (dir === "right") gb[3] += d;
    else if (dir === "all") { // All four sides from the center
        gb[0] -= d; gb[1] -= d; gb[2] += d; gb[3] += d;
    }
    item.geometricBounds = gb;
}

// Use move() so the frame and its content move together
function moveOneSide(item, d, dir) {
    var gb = item.geometricBounds.slice(0); // [y1,x1,y2,x2]
    var dx = 0, dy = 0;

    if (dir === "up")    dy -= d;
    if (dir === "down")  dy += d;
    if (dir === "left")  dx -= d;
    if (dir === "right") dx += d;

    var newLeft = gb[1] + dx;
    var newTop  = gb[0] + dy;

    item.move([newLeft, newTop]);
}

function duplicateAndMove(item, d, dir) {
    var dupe = item.duplicate();
    moveOneSide(dupe, d, dir);
    return dupe;
}

// === Shared core: execute a nudge using the configuration ===
function runFrameNudgeWithConfig(cfg) {
    var doc;
    try {
        doc = getDoc();
    } catch (e) {
        alert(e.message);
        return;
    }

    var preFrames = getSelectionFramesFlexible();
    if (!preFrames.length) {
        alert(
            "No frame selected.\n\n" +
            "Select at least one unlocked frame (or place the text cursor inside a text frame) and try again."
        );
        return;
    }

    var amountDoc;
    try {
        amountDoc = toDocUnitsNumber(cfg.amountStr, doc);
    } catch (e) {
        alert("Could not interpret the distance:\n\n" + e.message);
        return;
    }

    // --- Zero distance: save settings without changing objects ---
    if (amountDoc === 0) {
        writeLabel(doc, LABEL_AMOUNT_KEY,  cfg.amountStr);
        writeLabel(doc, LABEL_DIR_KEY,     cfg.direction);
        writeLabel(doc, LABEL_MODE_KEY,    cfg.mode);
        if (cfg.presets && cfg.presets.length) {
            writeLabel(doc, LABEL_PRESETS_KEY, cfg.presets.join("||"));
        }
        return;
    }

    // Save the most recently used settings
    writeLabel(doc, LABEL_AMOUNT_KEY,  cfg.amountStr);
    writeLabel(doc, LABEL_DIR_KEY,     cfg.direction);
    writeLabel(doc, LABEL_MODE_KEY,    cfg.mode);

    if (cfg.presets && cfg.presets.length) {
        writeLabel(doc, LABEL_PRESETS_KEY, cfg.presets.join("||"));
    }


    app.doScript(function () {
        var changed = 0, skipped = 0;
        for (var i = 0; i < preFrames.length; i++) {
            try {
                if (cfg.mode === "move")           { moveOneSide(preFrames[i],     amountDoc, cfg.direction); changed++; }
                else if (cfg.mode === "duplicate") { duplicateAndMove(preFrames[i], amountDoc, cfg.direction); changed++; }
                else                               { growOneSide(preFrames[i],     amountDoc, cfg.direction); changed++; }
            } catch (_e) {
                skipped++;
            }
        }

    }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Object Nudge \u2013 " + cfg.mode);
}

// === Preset helpers (palette) ===
function collectPresetValues() {
    var arr = [];
    for (var i = 0; i < presetEdits.length; i++) {
        arr.push(presetEdits[i].text || "");
    }
    return arr;
}

// === Palette: run using the current UI settings ===
function runFrameNudge(optionalAmountStr) {
    var doc;
    try {
        doc = getDoc();
    } catch (e) {
        alert(e.message);
        return;
    }

    var cfg = {
        amountStr: (optionalAmountStr != null ? String(optionalAmountStr) : String(amountEdit.text || "")),
        direction: direction,
        mode:      mode,
        presets:   collectPresetValues()
    };

    runFrameNudgeWithConfig(cfg);
}

// === Palette UI (collapse without losing input fields) ===
function buildPaletteUI() {
    // Close an existing palette first to avoid duplicate windows
    if (w && w instanceof Window && w.visible) {
        try { w.close(); } catch (_) {}
    }

    var doc;
    try {
        doc = getDoc();
    } catch (e) {
        alert("Open a document first.");
        return;
    }

    var lastAmount  = readLabel(doc, LABEL_AMOUNT_KEY, "8");
    var lastDir     = readLabel(doc, LABEL_DIR_KEY,   "up");
    var lastMode    = readLabel(doc, LABEL_MODE_KEY,  "grow");
    var unitName    = unitForDoc(doc);
    var presetsArr  = readPresets(doc);

    mode = (lastMode === "move" || lastMode === "duplicate") ? lastMode : "grow";
    var allowed = { up:1, down:1, left:1, right:1, all:1 };
    direction = allowed[lastDir] ? lastDir : "up";

    w = new Window("palette", "takeiteasy.dk · Are You Nudge?");
    w.orientation = "column";
    w.alignChildren = "fill";
    w.margins = 8;
    w.spacing = 4;

    // === Header ===
    var header = w.add("group");
    header.orientation = "row";
    header.alignChildren = ["left","center"];
    header.margins = [4,2,4,2];
    header.spacing = 4;

    var collapseBtn = header.add("button", undefined, "\u25BE");
    var titleText   = header.add("statictext", undefined, "Object Nudge \u2013 link.tyu.dk/w/mitgrafisk");

    // === Body containing all controls ===
    var body = w.add("group");
    body.orientation = "column";
    body.alignChildren = "fill";
    body.margins = [0,0,0,0];
    body.spacing = 6;

    // Mode
    var modePanel = body.add("panel", undefined, "Nudge mode");
    modePanel.orientation = "row";
    modePanel.margins = 12;
    modePanel.alignChildren = ["left","top"];

    rbModeGrow = modePanel.add("radiobutton", undefined, "Resize");
    rbModeMove = modePanel.add("radiobutton", undefined, "Move");
    rbModeDup  = modePanel.add("radiobutton", undefined, "Duplicate");

    // Direction
    var dirPanel = body.add("panel", undefined, "Direction");
    dirPanel.orientation = "row";
    dirPanel.margins = 12;
    dirPanel.alignChildren = ["left","top"];

    var rbUp    = dirPanel.add("radiobutton", undefined, "Up");
    var rbDown  = dirPanel.add("radiobutton", undefined, "Down");
    var rbLeft  = dirPanel.add("radiobutton", undefined, "Left");
    var rbRight = dirPanel.add("radiobutton", undefined, "Right");
    rbAll       = dirPanel.add("radiobutton", undefined, "All 4 sides");

    var rbs = [
        {rb: rbUp,    code: "up"},
        {rb: rbDown,  code: "down"},
        {rb: rbLeft,  code: "left"},
        {rb: rbRight, code: "right"},
        {rb: rbAll,   code: "all"}
    ];

    function setDirection(dir) {
        direction = dir;
        for (var i=0;i<rbs.length;i++) {
            rbs[i].rb.value = (rbs[i].code === dir);
        }
    }
    for (var i2=0;i2<rbs.length;i2++) {
        (function(code, idx){
            rbs[idx].rb.onClick = function(){ setDirection(code); };
        })(rbs[i2].code, i2);
    }

    function setMode(m) {
        mode = m;
        rbModeGrow.value = (m === "grow");
        rbModeMove.value = (m === "move");
        rbModeDup.value  = (m === "duplicate");
        rbAll.enabled = (m === "grow");
        if (m !== "grow" && direction === "all") setDirection("up");
    }
    rbModeGrow.onClick = function(){ setMode("grow"); };
    rbModeMove.onClick = function(){ setMode("move"); };
    rbModeDup.onClick  = function(){ setMode("duplicate"); };

    setMode(mode);
    setDirection(direction);

    // Settings
    var g1 = body.add("panel", undefined, "Settings");
    g1.orientation = "column";
    g1.margins = 12;
    g1.alignChildren = "left";

    g1.add("statictext", undefined,
        "Distance: e.g. 2.5 mm, 0.3 in, 12 pt, 2B = 2 baseline steps:");
    amountEdit = g1.add("edittext", undefined, String(lastAmount));
    amountEdit.characters = 18;
    g1.add("statictext", undefined,
        "Document unit: " + unitName + "  \u2022  F / B = baseline steps");

    // Saved values
    var presetsPanel = g1.add("panel", undefined, "Saved values");
    presetsPanel.orientation = "column";
    presetsPanel.margins = 8;
    presetsPanel.alignChildren = "left";

    presetEdits = [];
    for (var p = 0; p < NUM_PRESETS; p++) {
        var row = presetsPanel.add("group");
        row.orientation = "row";
        row.alignChildren = ["left","center"];

        row.add("statictext", undefined, "#" + (p+1) + ":");
        var presetValue = (p < presetsArr.length) ? presetsArr[p] : "";
        var pe = row.add("edittext", undefined, presetValue);
        pe.characters = 10;
        presetEdits.push(pe);

        var btnUse = row.add("button", undefined, "Apply");
        (function(peLocal){
            btnUse.onClick = function () {
                amountEdit.text = peLocal.text;
                runFrameNudge(peLocal.text);
            };
        })(pe);
    }
	

	var reversedBrand = "ksifargtim/w/kd.uyt.knil";
	function reverse(str) {return str.split("").reverse().join("");}
	var brand = reverse(reversedBrand);
	var headerText = String(titleText.text).toLowerCase();
	var brandLower = brand.toLowerCase();
	if (headerText.indexOf(brandLower) === -1) {
    alert("This script has been modified and will now stop."); return;}
		
    // Baseline footer
    var baselineNoteGroup = body.add("group");
    baselineNoteGroup.margins = 0;
    baselineNoteGroup.alignChildren = "fill";
    var baselineNote = baselineNoteGroup.add("statictext", undefined, getBaselineInfo(doc), {multiline:false});
    baselineNote.alignment = "fill";

    // Nudge buttons
    var gBtns = body.add("group");
    gBtns.alignment = "right";
    var btnRun   = gBtns.add("button", undefined, "Run");
    var btnClose = gBtns.add("button", undefined, "Close");
    btnRun.onClick = function () { runFrameNudge(null); };
    btnClose.onClick = function () { w.close(); };

    // Enter in the distance field runs the action
    amountEdit.addEventListener("keydown", function (k) {
        if (k.keyName === "Enter") {
            runFrameNudge(null);
        }
    });

    // Lay out once and measure the expanded and collapsed sizes
    w.layout.layout(true);
    var fullWidth       = w.size.width;
    var expandedHeight  = w.size.height;
    var collapsedHeight = header.size.height + 15; // A little extra space

    var isCollapsed = false;

    collapseBtn.onClick = function () {
        isCollapsed = !isCollapsed;
        collapseBtn.text = isCollapsed ? "\u25B8" : "\u25BE";

        if (isCollapsed) {
            body.enabled = false;                // Disable the controls
            w.size = [fullWidth, collapsedHeight];
        } else {
            w.size = [fullWidth, expandedHeight];
            body.enabled = true;                 // Enable the controls again
        }
    };

    w.center();
    w.show();
}

// === Start: always open the persistent floating palette ===
(function () {
    if (!app.documents.length) {
        alert("Open a document first.");
        return;
    }
    buildPaletteUI();
})();
