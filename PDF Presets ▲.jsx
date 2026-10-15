//DESCRIPTION: PDF Presets v.1.4.0 - ShortCut to your PDF Presets.
/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided “as is”, without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/

#target "InDesign"
#targetengine "PDFPresetPanel"

(function () {
    var key = "pdfPresetPanelV13";
    if ($.global[key]) {
        try {
            if ($.global[key].pdfLayoutRevision === 3) { $.global[key].show(); return; }
            if ($.global[key].pdfDispose) $.global[key].pdfDispose();
            else $.global[key].close();
        } catch (ignored) {}
    }
    // Replace an older panel in this persistent engine.
    try { if ($.global.pdfPresetPanelV12) { $.global.pdfPresetPanelV12.close(); } } catch (ignoredOld) {}
    var win = new Window("palette", "PDF Presets", undefined, {resizeable: true});
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 4;
    win.margins = 8;
    var header = win.add("group");
    header.orientation = "row";
    header.alignChildren = ["left", "center"];
    header.margins = 0;
    header.spacing = 4;
    var collapse = header.add("button", undefined, "- PDF Presets");
    collapse.preferredSize = [156, 24];
    collapse.helpTip = "Collapse palette";
    var body = win.add("group");
    body.orientation = "column";
    body.alignment = ["fill", "fill"];
    body.alignChildren = ["fill", "top"];
    body.margins = [0, 4, 0, 0];
    body.spacing = 4;
    body.add("statictext", undefined, "Export the active document using:");
    var search = body.add("edittext", undefined, "");
    search.helpTip = "Search PDF presets";
    var list = body.add("listbox", undefined, [], {multiselect: false});
    list.preferredSize = [400, 330];
    list.minimumSize = [300, 100];
    list.alignment = ["fill", "fill"];
    body.add("statictext", undefined, "Double-click a preset to open export dialogs.");
    var buttons = body.add("group");
    buttons.alignment = ["right", "bottom"];
    var refresh = buttons.add("button", undefined, "Refresh");
    var close = buttons.add("button", undefined, "Close");
    var next = buttons.add("button", undefined, "Export...");
    var names = [], busy = false, updating = false, currentDoc = null, task = null;
    var labelKey = "PDFPresetPanel.lastPreset";
    function activeDocument() {
        try { return app.documents.length ? app.activeDocument : null; } catch (e) { return null; }
    }
    function remembered() {
        try { return currentDoc ? currentDoc.extractLabel(labelKey) : ""; } catch (e) { return ""; }
    }
    function syncDocument() {
        if (busy || !win.visible) { return; }
        var doc = activeDocument();
        if (doc && currentDoc && currentDoc.isValid && doc.id === currentDoc.id) { return; }
        if (!doc && !currentDoc) { return; }
        currentDoc = doc;
        search.text = "";
        populate(remembered());
    }
    function rememberSelection() {
        if (updating || busy) { return; }
        var doc = activeDocument();
        if (!doc || !currentDoc || !currentDoc.isValid || doc.id !== currentDoc.id) {
            syncDocument();
            return;
        }
        next.enabled = list.selection !== null;
        if (list.selection) {
            var selected = list.selection.text;
            if (remembered() !== selected) { currentDoc.insertLabel(labelKey, selected); }
        }
    }

    function populate(preferred) {
        updating = true;
        var previous = typeof preferred === "string" ? preferred : (list.selection ? list.selection.text : remembered());
        var query = search.text.toLowerCase();
        list.removeAll();
        for (var j = 0; j < names.length; j++) {
            if (names[j].toLowerCase().indexOf(query) !== -1) {
                var row = list.add("item", names[j]);
                if (names[j] === previous) { list.selection = row; }
            }
        }
        if (!list.selection && list.items.length) { list.selection = 0; }
        next.enabled = currentDoc !== null && list.selection !== null;
        updating = false;
    }
    function reload() {
        names = [];
        for (var i = 0; i < app.pdfExportPresets.length; i++) {
            names.push(app.pdfExportPresets[i].name);
        }
        names.sort(function (a, b) {
            a = a.toLowerCase(); b = b.toLowerCase();
            return a < b ? -1 : (a > b ? 1 : 0);
        });
        populate();
    }
    function exportSelected() {
        syncDocument();
        if (busy || !list.selection) { return; }
        rememberSelection();
        var chosen = list.selection.text;
        var oldInteraction = app.scriptPreferences.userInteractionLevel;
        busy = true;
        try {
            app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;
            if (!app.documents.length) {
                alert("Please open an InDesign document first.");
                return;
            }
            if (!app.pdfExportPresets.itemByName(chosen).isValid) {
                alert("This preset is no longer available. Click Refresh.");
                return;
            }
            // Release palette focus while InDesign owns the native dialogs.
            win.hide();
            invokePreset(chosen);
        } catch (e) {
            if (e.number !== 8007) {
                alert("PDF export could not be completed.\n" + e.message);
            }
        } finally {
            app.scriptPreferences.userInteractionLevel = oldInteraction;
            busy = false;
            win.show();
        }
    }
    search.onChanging = function () { populate(); };
    list.onChange = rememberSelection;
    refresh.onClick = reload;
    next.onClick = exportSelected;
    list.onDoubleClick = exportSelected;
    close.onClick = function () { win.hide(); };
    // Keep the native controls alive across Close/reopen as well as folding.
    win.onClose = function () { win.hide(); return false; };
    win.pdfDispose = function () {
        try { if (task && task.isValid) task.remove(); } catch (ignoredTask) {}
        win.hide(); $.global[key] = null;
    };
    currentDoc = activeDocument();
    reload();
    populate(remembered());
    win.onActivate = syncDocument;
    try {
        task = app.idleTasks.add({name: "PDFPresetPanelV13DocumentWatch", sleep: 500});
        task.addEventListener(IdleEvent.ON_IDLE, syncDocument);
    } catch (ignoredIdle) {}

    win.layout.layout(true);
    // ScriptUI can distribute surplus height even among top-aligned children.
    // Lock every non-list row to its natural height before resizing.
    var fixedRows = [header, body.children[0], search, body.children[3], buttons];
    for (var r = 0; r < fixedRows.length; r++) {
        var rowHeight = fixedRows[r].size.height;
        fixedRows[r].minimumSize.height = rowHeight;
        fixedRows[r].maximumSize.height = rowHeight;
    }
    win.minimumSize = [416, 240];
    var expandedSize = [win.size.width, win.size.height];
    var isCollapsed = false;
    function resizeContent() {
        if (isCollapsed) {
            header.bounds = [2, 2, 158, 26];
            collapse.bounds = [0, 0, 156, 24];
            body.bounds = [0, 28, 0, 28];
            return;
        }
        var width = win.size.width - 16;
        var top = 36;
        header.bounds = [8, 8, 164, 32];
        collapse.bounds = [0, 0, 156, 24];
        body.bounds = [8, top, 8 + width, win.size.height - 8];
        var labelHeight = body.children[0].size.height;
        var searchHeight = search.size.height;
        var hintHeight = body.children[3].size.height;
        var buttonHeight = buttons.size.height;
        var buttonWidth = buttons.size.width;
        var y = 4;
        body.children[0].bounds = [0, y, width, y + labelHeight];
        y += labelHeight + 4;
        search.bounds = [0, y, width, y + searchHeight];
        y += searchHeight + 4;
        var buttonTop = body.size.height - buttonHeight;
        var hintTop = buttonTop - 4 - hintHeight;
        list.bounds = [0, y, width, hintTop - 4];
        body.children[3].bounds = [0, hintTop, width, hintTop + hintHeight];
        buttons.bounds = [width - buttonWidth, buttonTop, width, body.size.height];
    }
    win.onResizing = win.onResize = resizeContent;
    collapse.onClick = function () {
        var position = [win.location.x, win.location.y];
        isCollapsed = !isCollapsed;
        collapse.text = isCollapsed ? "+ PDF Presets" : "- PDF Presets";
        collapse.helpTip = isCollapsed ? "Expand palette" : "Collapse palette";
        if (isCollapsed) {
            expandedSize = [win.size.width, win.size.height];
            // Do not hide or disable the parent container of native edit controls.
            for (var i = 0; i < body.children.length; i++) body.children[i].visible = false;
            win.minimumSize = [160, 28];
            win.maximumSize = [160, 28];
            win.margins = 2;
            win.size = [160, 28];
        } else {
            win.maximumSize = [10000, 10000];
            win.minimumSize = [416, 240];
            win.margins = 8;
            for (var j = 0; j < body.children.length; j++) body.children[j].visible = true;
            win.size = expandedSize;
        }
        resizeContent();
        if (!isCollapsed) {
            // Refresh macOS native hit regions after restoring the bounds.
            win.size = [expandedSize[0] + 1, expandedSize[1]];
            win.size = expandedSize;
            resizeContent();
        }
        win.location = position;
        win.update();
    };
    // Keep automatic layout from moving native edit fields after a resize/show.
    win.layout = {layout: resizeContent, resize: resizeContent};
    win.onShow = resizeContent;
    win.pdfLayoutRevision = 3;
    $.global[key] = win;
    win.center();
    win.show();

    function invokePreset(chosen) {
        var i;
        // Invoke the native preset command. exportFile(..., true, preset)
        // can retain the dialog's previous preset instead of selecting this one.
        var fileMenu = app.menus.item("$ID/Main").submenus.item("$ID/File");
        var presetMenu = null;
        var menuKeys = ["$ID/Adobe PDF Presets", "Adobe PDF Presets", "$ID/PDF Export Presets"];
        for (i = 0; i < menuKeys.length; i++) {
            var candidate = fileMenu.submenus.item(menuKeys[i]);
            if (candidate.isValid) { presetMenu = candidate; break; }
        }
        if (!presetMenu) {
            alert("Cannot find File > Adobe PDF Presets. Please use the native menu.");
            return;
        }
        var matches = [];
        for (i = 0; i < presetMenu.menuItems.length; i++) {
            var entry = presetMenu.menuItems[i];
            // Match exact names, allowing only InDesign's appended ellipsis.
            if (entry.name === chosen || entry.name === chosen + "..." ||
                    entry.name === chosen + "\u2026") {
                matches.push(entry);
            }
        }
        if (matches.length !== 1) {
            alert("Cannot uniquely identify the PDF preset menu command:\n" + chosen +
                "\nPlease select it in File > Adobe PDF Presets.");
            return;
        }
        var action = matches[0].associatedMenuAction;
        if (!action.isValid || !action.enabled) {
            alert("The PDF preset menu command is currently unavailable:\n" + chosen);
            return;
        }
        // InDesign owns both the Save dialog and PDF options, including Cancel.
        action.invoke();
    }
}());
