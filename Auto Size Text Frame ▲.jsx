//DESCRIPTION: Auto Size v.1.4.1 - stage changes; apply reference and constraints before enabling sizing.
/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided "as is", without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/

#target "InDesign"
#targetengine "AutoSizePanel"

(function () {
    var key = "autoSizePanelV1", prior = $.global[key];
    if (prior) { try { prior.window.close(); } catch (_) {} }
    var w = new Window("palette", "Auto Size", undefined, {resizeable: false});
    w.orientation = "column"; w.alignChildren = "fill"; w.margins = 12;
    var fold = makeCollapsiblePalette(w, "Auto Size");
    var content = fold.body;
    var status = content.add("statictext", undefined, "Select text frames");
    status.preferredSize.width = 310;
    var body = content.add("group"); body.orientation = "column"; body.alignChildren = "fill";
    var types = [AutoSizingTypeEnum.OFF, AutoSizingTypeEnum.HEIGHT_ONLY,
        AutoSizingTypeEnum.WIDTH_ONLY, AutoSizingTypeEnum.HEIGHT_AND_WIDTH,
        AutoSizingTypeEnum.HEIGHT_AND_WIDTH_PROPORTIONALLY];
    var refs = [AutoSizingReferenceEnum.TOP_LEFT_POINT, AutoSizingReferenceEnum.TOP_CENTER_POINT,
        AutoSizingReferenceEnum.TOP_RIGHT_POINT, AutoSizingReferenceEnum.LEFT_CENTER_POINT,
        AutoSizingReferenceEnum.CENTER_POINT, AutoSizingReferenceEnum.RIGHT_CENTER_POINT,
        AutoSizingReferenceEnum.BOTTOM_LEFT_POINT, AutoSizingReferenceEnum.BOTTOM_CENTER_POINT,
        AutoSizingReferenceEnum.BOTTOM_RIGHT_POINT];
    body.add("statictext", undefined, "Reference Point");
    var anchor = body.add("dropdownlist", undefined, ["7 · Top Left", "8 · Top Center", "9 · Top Right", "4 · Center Left", "5 · Center", "6 · Center Right", "1 · Bottom Left", "2 · Bottom Center", "3 · Bottom Right", "— Mixed —"]);
    body.add("statictext", undefined, "Auto-Sizing");
    var mode = body.add("dropdownlist", undefined, ["O · Off", "H · Height Only", "W · Width Only", "B · Height and Width", "P · Height and Width (Keep Proportions)", "— Mixed —"]);
    var constraints = body.add("panel", undefined, "Constraints");
    constraints.orientation = "column"; constraints.alignChildren = "fill"; constraints.margins = 12;
    function minimum(label) {
        var g = constraints.add("group");
        var check = g.add("checkbox", undefined, label); check.preferredSize.width = 175;
        var value = g.add("edittext", undefined, "0"); value.characters = 7;
        g.add("statictext", undefined, "mm");
        return {check: check, value: value, label: label};
    }
    var height = minimum("Minimum Height"), width = minimum("Minimum Width");
    var noBreak = constraints.add("checkbox", undefined, "No Line Breaks");
    noBreak.helpTip = "Controls Auto-Size line wrapping. Does not remove paragraph or manual line breaks.";
    var note = content.add("statictext", undefined, "Choose settings, then click Apply.");
    var applyButton = content.add("button", undefined, "Apply");
    applyButton.enabled = false;
    var pending = {}, selectionKey = "";
    function identity(items) {
        var ids = [];
        for (var i = 0; i < items.length; i++) ids.push(items[i].toSpecifier());
        ids.sort(); return ids.join("|");
    }
    function hasPending() { for (var name in pending) if (pending.hasOwnProperty(name)) return true; return false; }
    var refreshButton = content.add("button", undefined, "Read Selection");
    var busy = false, closed = false, listeners = [], lastError = "";
    var details = content.add("button", undefined, "Details");
    details.onClick = function () { alert(lastError || "No errors reported."); };
    function frames() {
        var result = [], seen = {}, selection;
        try { if (!app.documents.length || !app.layoutWindows.length) return result; selection = app.selection; }
        catch (_) { return result; }
        function add(frame) {
            if (!frame || !frame.isValid || seen[frame.id]) return;
            seen[frame.id] = true; result.push(frame);
        }
        for (var i = 0; i < selection.length; i++) {
            var item = selection[i];
            try {
                if (item.constructor.name === "TextFrame") add(item);
                else if (item.parentTextFrames) {
                    var parents = item.parentTextFrames;
                    for (var j = 0; j < parents.length; j++) add(parents[j]);
                }
            } catch (_) {}
        }
        return result;
    }
    // Reading a selection must not modify scriptPreferences from an event callback.
    function toMM(value, dimension) {
        var unit = app.scriptPreferences.measurementUnit;
        if (unit == AutoEnum.AUTO_VALUE) unit = app.activeDocument.viewPreferences[
            dimension === "Height" ? "verticalMeasurementUnits" : "horizontalMeasurementUnits"];
        var names = ["MILLIMETERS", "CENTIMETERS", "INCHES", "INCHES_DECIMAL", "POINTS", "PICAS", "CUSTOM", "PIXELS", "AGATES", "CICEROS"];
        var factors = [1, 10, 25.4, 25.4, 25.4/72, 25.4/6, 25.4/72, 25.4/72, 25.4/14, 600/133];
        for (var i = 0; i < names.length; i++) if (unit == MeasurementUnits[names[i]]) return Number(value) * factors[i];
        throw new Error("Unsupported measurement unit: " + unit);
    }
    function common(items, property) {
        var value = items[0].textFramePreferences[property];
        for (var i = 1; i < items.length; i++)
            if (items[i].textFramePreferences[property] != value) return null;
        return value;
    }
    function choose(control, values, value) {
        control.selection = values.length;
        for (var i = 0; i < values.length; i++) if (value != null && values[i] == value) control.selection = i;
    }
    function check(control, label, value) {
        control.text = label + (value === null ? " (mixed)" : "");
        control.value = value === true;
    }
    function refresh(force) {
        if (busy || closed) return;
        var current = frames(), currentKey = identity(current);
        selectionKey = currentKey;
        status.text = current.length ? current.length + " text frame(s) selected" : "Select text frames or place the text cursor";
        applyButton.enabled = current.length > 0 && hasPending();
        if (force !== true) return;
        pending = {}; selectionKey = currentKey; applyButton.enabled = false;
        note.text = "Choose settings, then click Apply.";
        busy = true;
        try {
            lastError = "";
            var items = frames();
            status.text = items.length ? items.length + " text frame(s) selected" : "Select text frames or place the text cursor";
            if (!items.length) return;
            choose(mode, types, common(items, "autoSizingType"));
            choose(anchor, refs, common(items, "autoSizingReferencePoint"));
            check(noBreak, "No Line Breaks", common(items, "useNoLineBreaksForAutoSizing"));
            function readMinimum(control, dimension) {
                check(control.check, control.label, common(items, "useMinimum" + dimension + "ForAutoSizing"));
                var value = common(items, "minimum" + dimension + "ForAutoSizing");
                control.value.text = value === null ? "" : String(Math.round(toMM(value, dimension) * 10000) / 10000);
                control.value.helpTip = value === null ? "Mixed values; enter a minimum in mm" : "Minimum in mm";
            }
            readMinimum(height, "Height"); readMinimum(width, "Width");
        } catch (e) { status.text = "Read error — click Details"; lastError = e.message + " (line " + e.line + ")"; }
        finally { busy = false; remember(); }
    }
    function stage(property, value) {
        if (busy) return;
        pending[property] = value;
        remember();
        note.text = "Settings retained — click Apply.";
    }
    // Store a reusable preset, independently of the currently selected frame.
    var settingsKey = "AutoSizePanel.settings.v1";
    function remember() {
        pending = {};
        if (mode.selection && mode.selection.index < types.length) pending.autoSizingType = types[mode.selection.index];
        if (anchor.selection && anchor.selection.index < refs.length) pending.autoSizingReferencePoint = refs[anchor.selection.index];
        function minimumSetting(control, dimension) {
            if (control.check.text.indexOf("(mixed)") < 0)
                pending["useMinimum" + dimension + "ForAutoSizing"] = control.check.value;
            if (control.value.text !== "") pending["minimum" + dimension + "ForAutoSizing"] = control.value.text;
        }
        minimumSetting(height, "Height"); minimumSetting(width, "Width");
        if (noBreak.text.indexOf("(mixed)") < 0) pending.useNoLineBreaksForAutoSizing = noBreak.value;
        applyButton.enabled = frames().length > 0 && hasPending();
        var data = [mode.selection ? mode.selection.index : types.length,
            anchor.selection ? anchor.selection.index : refs.length,
            height.check.value ? 1 : 0, height.value.text,
            width.check.value ? 1 : 0, width.value.text, noBreak.value ? 1 : 0,
            height.check.text, width.check.text, noBreak.text];
        try { app.insertLabel(settingsKey, data.join("\u0001")); } catch (_) {}
    }
    function restoreSettings() {
        var data = app.extractLabel(settingsKey).split("\u0001");
        if (data.length !== 10) return false;
        busy = true;
        try {
            mode.selection = Math.max(0, Math.min(types.length, Number(data[0])));
            anchor.selection = Math.max(0, Math.min(refs.length, Number(data[1])));
            height.check.value = data[2] === "1"; height.value.text = data[3];
            width.check.value = data[4] === "1"; width.value.text = data[5];
            noBreak.value = data[6] === "1";
            height.check.text = data[7]; width.check.text = data[8]; noBreak.text = data[9];
        } finally { busy = false; }
        remember(); return true;
    }

    function normalizeReference() {
        if (!mode.selection || !anchor.selection || anchor.selection.index >= refs.length) return;
        var index = anchor.selection.index;
        if (mode.selection.index === 1) index = Math.floor(index / 3) * 3 + 1;
        if (mode.selection.index === 2) index = 3 + index % 3;
        if (index !== anchor.selection.index) {
            busy = true; anchor.selection = index; busy = false;
            if (pending.hasOwnProperty("autoSizingReferencePoint")) pending.autoSizingReferencePoint = refs[index];
        }
    }
    function applyPending() {
        if (busy || !hasPending()) return;
        var items = frames(), failures = [], changes = {};
        for (var field in pending) if (pending.hasOwnProperty(field)) changes[field] = pending[field];
        if (!items.length) { refresh(); return; }
        // Validate before disabling Auto-Size on any frame.
        for (var name in changes) if (changes.hasOwnProperty(name) && name.indexOf("minimum") === 0) {
            var raw = String(changes[name]).replace(/,/g, ".").replace(/^\s+|\s+$/g, "");
            if (!raw || !isFinite(Number(raw)) || Number(raw) < 0) {
                alert("Enter a non-negative number in mm."); return;
            }
            changes[name] = Number(raw) + " mm";
        }
        busy = true;
        try {
            app.doScript(function () {
                for (var i = 0; i < items.length; i++) {
                    var p = null, saved = null, bounds = null;
                    try {
                        if (items[i].locked || items[i].itemLayer.locked) throw new Error("Frame or layer is locked");
                        p = items[i].textFramePreferences;
                        var names = ["autoSizingReferencePoint", "minimumHeightForAutoSizing", "minimumWidthForAutoSizing",
                            "useMinimumHeightForAutoSizing", "useMinimumWidthForAutoSizing", "useNoLineBreaksForAutoSizing"];
                        saved = {autoSizingType: p.autoSizingType};
                        for (var j = 0; j < names.length; j++) saved[names[j]] = p[names[j]];
                        bounds = items[i].geometricBounds;
                        // Freeze the current geometry while preparing all settings.
                        p.autoSizingType = AutoSizingTypeEnum.OFF;
                        // Record the pre-resize geometry explicitly for Undo.
                        items[i].geometricBounds = bounds;
                        p.autoSizingReferencePoint = changes.hasOwnProperty("autoSizingReferencePoint") ? changes.autoSizingReferencePoint : saved.autoSizingReferencePoint;
                        for (j = 1; j < names.length; j++) if (changes.hasOwnProperty(names[j])) p[names[j]] = changes[names[j]];
                        p.autoSizingType = changes.hasOwnProperty("autoSizingType") ? changes.autoSizingType : saved.autoSizingType;
                        if (changes.hasOwnProperty("useNoLineBreaksForAutoSizing") && p.useNoLineBreaksForAutoSizing !== changes.useNoLineBreaksForAutoSizing)
                            throw new Error("InDesign did not retain No Line Breaks");
                    } catch (e) {
                        var message = "Frame " + items[i].id + ": " + e.message;
                        if (p && saved) try {
                            p.autoSizingType = AutoSizingTypeEnum.OFF;
                            for (var prop in saved) if (prop !== "autoSizingType" && saved.hasOwnProperty(prop)) p[prop] = saved[prop];
                            items[i].geometricBounds = bounds;
                            p.autoSizingType = saved.autoSizingType;
                        } catch (restoreError) { message += " (Restore failed: " + restoreError.message + "; use Undo.)"; }
                        failures.push(message);
                    }
                }
            }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Apply Auto Size");
        } catch (e) { failures.push(e.message); }
        finally { busy = false; refresh(); }
        if (failures.length) { lastError = failures.join("\n"); alert("Some changes could not be applied:\n\n" + lastError); }
    }
    mode.onChange = function () {
        if (busy) return;
        if (this.selection && this.selection.index < types.length) stage("autoSizingType", types[this.selection.index]);
        else delete pending.autoSizingType;
        normalizeReference();
        remember();
    };
    anchor.onChange = function () {
        if (busy) return;
        if (this.selection && this.selection.index < refs.length) stage("autoSizingReferencePoint", refs[this.selection.index]);
        else delete pending.autoSizingReferencePoint;
        normalizeReference();
        remember();
    };
    noBreak.onClick = function () { this.text = "No Line Breaks"; stage("useNoLineBreaksForAutoSizing", this.value); };
    function bindMinimum(control, dimension) {
        control.check.onClick = function () { this.text = control.label; stage("useMinimum" + dimension + "ForAutoSizing", this.value); };
        control.value.onChanging = function () { stage("minimum" + dimension + "ForAutoSizing", this.text); };
    }
    bindMinimum(height, "Height"); bindMinimum(width, "Width");
    applyButton.onClick = applyPending;
    refreshButton.onClick = function () { refresh(true); };
    // Capture only keys addressed to this palette, never global InDesign keys.
    var shortcutHelp = content.add("statictext", undefined,
        "Reference: 7 8 9 / 4 5 6 / 1 2 3\nO Off · H Height · W Width · B Both · P Proportional\nN No Line Breaks · Enter Apply", {multiline: true});
    shortcutHelp.preferredSize = [340, 52];
    function handleShortcut(event) {
        if (closed || busy || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        var keyName = String(event.keyName || "").toUpperCase();
        var editing = event.target && event.target.type === "edittext";
        // Text editing retains digits, letters, navigation and clipboard shortcuts.
        if (editing && keyName !== "ENTER" && keyName !== "RETURN") return;
        if (fold.isCollapsed()) return;
        var key = keyName.replace(/^(NUMPAD|NUM|DIGIT)/, "");
        var referenceKeys = {"7":0, "8":1, "9":2, "4":3, "5":4, "6":5, "1":6, "2":7, "3":8};
        var modeKeys = {O:0, H:1, W:2, B:3, P:4};
        var handled = true;
        if (key === "ENTER" || key === "RETURN") {
            // onChanging normally stages this already; also capture the final edit.
            if (event.target === height.value) stage("minimumHeightForAutoSizing", height.value.text);
            if (event.target === width.value) stage("minimumWidthForAutoSizing", width.value.text);
            applyPending();
        } else if (referenceKeys.hasOwnProperty(key)) {
            busy = true; anchor.selection = referenceKeys[key]; busy = false;
            anchor.onChange();
        } else if (modeKeys.hasOwnProperty(key)) {
            busy = true; mode.selection = modeKeys[key]; busy = false;
            mode.onChange();
        } else if (key === "N") {
            noBreak.value = !noBreak.value; noBreak.onClick();
        } else handled = false;
        if (handled) { event.preventDefault(); event.stopPropagation(); }
    }
    w.addEventListener("keydown", handleShortcut, true);
    function dispose() {
        closed = true;
        for (var i = 0; i < listeners.length; i++) try { listeners[i].remove(); } catch (_) {}
        $.global[key] = null;
    }
    w.onClose = dispose;
    try { listeners.push(app.addEventListener("afterSelectionChanged", refresh)); } catch (_) {}
    try { listeners.push(app.addEventListener("afterSelectionAttributeChanged", refresh)); } catch (_) {}
    $.global[key] = {window: w, refresh: refresh};
    if (!restoreSettings()) refresh(true);
    refresh(); w.show(); w.active = true;
function makeCollapsiblePalette(win, compactTitle) {
    var header = win.add("group");
    header.alignment = ["left", "top"];
    var toggle = header.add("button", undefined, "- " + compactTitle);
    toggle.preferredSize = [156, 24];
    toggle.helpTip = "Collapse palette";
    var body = win.add("group");
    body.orientation = "column";
    body.alignChildren = "fill";
    body.spacing = 7;
    var collapsed = false, saved;
    // Keep the content container live: hiding/disabling it can strand native
    // edit controls on macOS. Preserve individual child visibility instead.
    function hideChildren() {
        saved.children = [];
        for (var i = 0; i < body.children.length; i++) {
            saved.children.push(body.children[i].visible);
            body.children[i].visible = false;
        }
    }
    function restoreChildren() {
        for (var i = 0; i < body.children.length; i++)
            body.children[i].visible = saved.children[i];
    }
    function pair(value) { return [value[0], value[1]]; }
    function setCollapsed(value) {
        value = !!value;
        if (value === collapsed) return;
        var position = pair(win.location);
        if (value) {
            saved = {size:pair(win.size), min:pair(body.minimumSize),
                max:pair(body.maximumSize), pref:pair(body.preferredSize),
                windowMin:pair(win.minimumSize), spacing:win.spacing,
                margins:[win.margins.left, win.margins.top, win.margins.right, win.margins.bottom]};
            hideChildren();
            body.minimumSize = [0,0];
            body.maximumSize = [0,0];
            body.preferredSize = [0,0];
            win.minimumSize = [0,0];
            win.spacing = 0;
            win.margins = [2, 2, 2, 2];
        } else {
            body.maximumSize = saved.max;
            body.minimumSize = saved.min;
            body.preferredSize = saved.pref;
            restoreChildren();
            win.minimumSize = saved.windowMin;
            win.spacing = saved.spacing;
            win.margins = saved.margins;
        }
        collapsed = value;
        toggle.text = (collapsed ? "+ " : "- ") + compactTitle;
        toggle.helpTip = collapsed ? "Expand palette" : "Collapse palette";
        win.layout.layout(true);
        if (collapsed) {
            win.size = [header.size.width + win.margins.left + win.margins.right,
                header.size.height + win.margins.top + win.margins.bottom];
        } else {
            win.size = saved.size;
        }
        win.layout.resize();
        win.location = position;
        // Refresh native hit regions after restoring the expanded bounds.
        var bounds = [win.bounds.left, win.bounds.top, win.bounds.right, win.bounds.bottom];
        win.bounds = [bounds[0], bounds[1], bounds[2] + 1, bounds[3]];
        win.bounds = bounds;
        win.layout.resize();
        win.update();
    }
    toggle.onClick = function () { setCollapsed(!collapsed); };
    return {body:body, toggle:toggle, setCollapsed:setCollapsed,
        isCollapsed:function () { return collapsed; }};
}


}());
