//DESCRIPTION: Page Color Labels v.1.1.3 - Apply page color labels and keep document-specific label notes.
/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided "as is", without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/

#target "InDesign"
#targetengine "PageColorLabels"

// v1.1.1 — invoke the native Pages-panel actions, preserving its selection.
(function () {
    var key = "pageColorLabelsV1";
    var previous = $.global[key];
    if (previous) {
        try {
            if (previous.version === "1.1.1") { previous.window.show(); previous.syncNotes(); return; }
            previous.window.close();
        } catch (ignored) {}
    }
    function labelMenu() {
        return app.menus.itemByName("$ID/PagesPanelPopup")
            .submenus.itemByName("$ID/PageAttributesSubMenu")
            .submenus.itemByName("$ID/PageColorLabelMenu");
    }
    var menu = labelMenu();
    if (!menu.isValid || menu.menuItems.length === 0) {
        alert("The Pages panel Color Label menu is unavailable in this version of InDesign.");
        return;
    }
    // Native action IDs verified in InDesign 2026. Commands are discovered
    // from the actual submenu; IDs below are used only for swatch artwork.
    var rgb = {
        6344:[255,255,255], 6345:[255,153,204], 6346:[255,170,0],
        6347:[255,255,0], 6348:[0,255,0], 6349:[80,160,255],
        6350:[153,153,255], 6351:[128,128,128], 6352:[255,0,0],
        6353:[255,128,0], 6354:[204,160,110], 6355:[0,102,0],
        6356:[0,0,255], 6357:[153,51,255], 6358:[0,0,0]
    };
    var win = new Window("palette", "Page Color Labels · takeiteasy.dk", undefined, {resizeable:false});
    win.orientation = "column";
    win.alignChildren = "fill";
    win.spacing = 7;
    win.margins = 12;
    var fold = makeCollapsiblePalette(win, "Page Labels");
    var body = fold.body;
    body.add("statictext", undefined, "Select pages in the Pages panel.");
    var special = body.add("group");
    special.alignChildren = "fill";
    var grid = body.add("group");
    grid.orientation = "column";
    grid.alignChildren = "fill";
    grid.spacing = 4;
    var status;
    var buttons = [];
    function apply(id, name) {
        try {
            if (app.documents.length === 0) throw Error("Open a document first.");
            var pagesPanel = app.panels.itemByName("$ID/Pages");
            if (!pagesPanel.isValid || !pagesPanel.visible)
                throw Error("Open the Pages panel and select the pages first.");
            var action = app.menuActions.itemByID(id);
            if (!action.isValid || !action.enabled)
                throw Error("Select document or parent pages in the Pages panel first.");
            // Do not activate a layout page or infer a selection from activePage.
            action.invoke();
            status.text = "Applied: " + name;
        } catch (error) {
            status.text = "No label applied.";
            alert(error.message, "Page Color Labels");
        }
    }
    function addButton(parent, action, color) {
        var cell = parent.add("group");
        cell.spacing = 5;
        if (color) {
            var swatch = cell.add("panel");
            swatch.preferredSize = [18,18];
            swatch.onDraw = function () {
                var g = this.graphics;
                g.rectPath(0,0,this.size.width,this.size.height);
                g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR,
                    [color[0]/255,color[1]/255,color[2]/255,1]));
                g.rectPath(0.5,0.5,this.size.width-1,this.size.height-1);
                g.strokePath(g.newPen(g.PenType.SOLID_COLOR,[0.3,0.3,0.3,1],1));
            };
        }
        var name = action.name.replace(/&/g, "");
        var id = action.id;
        var button = cell.add("button", undefined, name);
        button.preferredSize = [124,27];
        button.helpTip = "Apply " + name + " to the selected pages in the Pages panel.";
        button.onClick = function () { apply(id, name); };
        buttons.push({id:id, button:button});
    }
    var row, column = 0;
    for (var i = 0; i < menu.menuItems.length; i++) {
        var action = menu.menuItems[i].associatedMenuAction;
        if (!action.isValid) continue;
        if (action.id === 6203 || action.id === 6204) {
            addButton(special, action, null);
        } else {
            if (column % 2 === 0) {
                row = grid.add("group");
                row.spacing = 12;
            }
            addButton(row, action, rgb[action.id] || [180,180,180]);
            column++;
        }
    }
    status = body.add("statictext", undefined, "Ready — click a color to apply.");
    status.preferredSize.width = 300;
    var notesPanel = body.add("panel", undefined, "Label notes");
    notesPanel.orientation = "column"; notesPanel.alignChildren = "fill";
    notesPanel.margins = 10;
    var notesDocument = notesPanel.add("statictext", undefined, "", {truncate:"middle"});
    notesDocument.preferredSize.width = 280;
    var notes = notesPanel.add("edittext", undefined, "", {multiline:true, scrolling:true, wantReturn:true});
    notes.preferredSize = [280, 100];
    notes.helpTip = "Explain your color labels here. Notes belong to this document. Save the document to keep them on disk.";
    var notesStatus = notesPanel.add("statictext", undefined, "Save the document to keep notes.");
    notesStatus.preferredSize.width = 280;
    var notesKey = "TakeItEasy.PageColorLabels.notes.v1";
    var noteText = "";
    var owner = null, loadingNotes = false, noteTask = null, noteListeners = [];
    function saveNotes() {
        if (loadingNotes || !owner || !owner.isValid) return true;
        try {
            if (owner.extractLabel(notesKey) !== noteText) owner.insertLabel(notesKey, noteText);
            notesStatus.text = "Save the document to keep notes.";
            return true;
        } catch (e) {
            notesStatus.text = "Notes not stored — " + e.message;
            notesStatus.helpTip = notesStatus.text;
            return false;
        }
    }
    function syncNotes() {
        var active = null;
        try { if (app.documents.length) active = app.activeDocument; } catch (_) {}
        if (owner && owner.isValid && active && owner.id === active.id) return;
        if (!owner && !active) { notes.enabled = false; notesDocument.text = "No document open"; return; }
        // Always commit to the document that supplied the editor, never a newly
        // active document. Selection changes can arrive before an idle event.
        if (!saveNotes()) return;
        loadingNotes = true;
        try {
            owner = active;
            noteText = owner ? owner.extractLabel(notesKey) : "";
            notes.text = noteText;
            notes.enabled = !!owner;
            notesDocument.text = owner ? owner.name : "No document open";
            notesDocument.helpTip = owner ? owner.name : "";
            notesStatus.text = owner ? "Save the document to keep notes." : "Open a document to write notes.";
        } finally { loadingNotes = false; }
    }
    function editNotes() {
        if (!loadingNotes && !fold.isCollapsed()) {
            noteText = notes.text; saveNotes(); syncNotes();
        }
    }
    notes.onChanging = notes.onChange = editNotes;
    // ScriptUI can leave a multiline edit control blank after hiding its
    // ancestor. Recreate that native control after expansion, from our model.
    fold.beforeChange = function () { loadingNotes = true; };
    fold.afterChange = function (collapsed) {
        try {
            if (!collapsed) {
                var tip = notes.helpTip, message = notesStatus.text;
                notesPanel.remove(notes); notesPanel.remove(notesStatus);
                notes = notesPanel.add("edittext", undefined, noteText,
                    {multiline:true, scrolling:true, wantReturn:true});
                notes.preferredSize = [280,100]; notes.helpTip = tip;
                notes.enabled = !!(owner && owner.isValid);
                notes.onChanging = notes.onChange = editNotes;
                notesStatus = notesPanel.add("statictext", undefined, message);
                notesStatus.preferredSize.width = 280;
                notesPanel.layout.layout(true);
                win.layout.layout(true); win.layout.resize(); win.update();
            }
        } finally { loadingNotes = false; }
        syncNotes();
    };
    win.onActivate = syncNotes;
    function disposeNotes() {
        try { if (noteTask && noteTask.isValid) noteTask.remove(); } catch (_) {}
        for (var n=0;n<noteListeners.length;n++) try { noteListeners[n].remove(); } catch (_) {}
    }
    win.onClose = function () {
        if (!saveNotes()) return false;
        disposeNotes(); $.global[key] = null;
    };
    try {
        noteTask = app.idleTasks.add({name:"PageColorLabelsNotesWatch", sleep:500});
        noteTask.addEventListener(IdleEvent.ON_IDLE, syncNotes);
        noteListeners.push(app.addEventListener("beforeSave", saveNotes));
        noteListeners.push(app.addEventListener("beforeSaveAs", saveNotes));
    } catch (_) {}
    $.global[key] = {version:"1.1.1", window:win, buttons:buttons, fold:fold, syncNotes:syncNotes};
    syncNotes(); win.show();
}());

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
    var collapsed = false, saved, api;
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
        if (api.beforeChange) api.beforeChange(value);
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
        if (api.afterChange) api.afterChange(collapsed);
    }
    toggle.onClick = function () { setCollapsed(!collapsed); };
    api = {body:body, toggle:toggle, setCollapsed:setCollapsed,
        isCollapsed:function () { return collapsed; }};
    return api;
}

