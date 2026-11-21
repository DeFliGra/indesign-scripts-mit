//DESCRIPTION: Script Manager v.1.7.0 — searchable launcher with persistent Favorites and grouped Collections.

/* Preferences are stored in InDesign application labels, never in scripts.
   Run scripts as files to preserve their own file paths and target engines. */
   
/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided "as is", without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/


#target "InDesign"
#targetengine "THScriptManagerV1"
   
(function () {
    var G = $.global, KEY = "THScriptManagerV1_", self = File($.fileName);
    if (G.thScriptManager && G.thScriptManager.window) {
        try {
            if (G.thScriptManager.version === "1.7.0") { G.thScriptManager.window.show(); G.thScriptManager.window.active = true; return; }
            G.thScriptManager.window.close();
        } catch (_) {}
    }
    // Modern Finder aliases can report alias=false in ExtendScript.
    function resolveScriptFile(source) {
        var target = source;
        if (source.alias) {
            target = source.resolve();
            if (!target) throw new Error("Cannot resolve alias: " + source.fsName);
        }
        if ($.os.indexOf("Mac") >= 0 && target instanceof File && target.exists) {
            var probe = new File(target.fsName), signature = "";
            probe.encoding = "BINARY";
            if (!probe.open("r")) throw new Error("Cannot read: " + target.fsName);
            try { signature = probe.read(8); } finally { probe.close(); }
            if (signature === "book\x00\x00\x00\x00") {
                // Foundation resolves bookmark aliases without launching Finder.
                var pathText = ("file://" + encodeURI(target.fsName)).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
                    .replace(/\r/g, "\\r").replace(/\n/g, "\\n");
                var appleScript = 'use framework "Foundation"\n' +
                    'set sourceURL to current application\'s NSURL\'s URLWithString:"' + pathText + '"\n' +
                    'set targetURL to current application\'s NSURL\'s URLByResolvingAliasFileAtURL:sourceURL options:768 |error|:(missing value)\n' +
                    'if targetURL is missing value then error "Cannot resolve script alias"\n' +
                    'return targetURL\'s absoluteString() as text';
                // Run AppleScriptObjC in osascript; InDesign's embedded AppleScript
                // runner does not reliably execute Foundation-based scripts.
                var command = "/usr/bin/osascript -e '" + appleScript.replace(/'/g, "'\\''") + "'";
                var bridge = 'do shell script "' + command.replace(/\\/g, "\\\\")
                    .replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"';
                var resolvedURI = app.doScript(bridge, ScriptLanguage.APPLESCRIPT_LANGUAGE);
                if (!resolvedURI) throw new Error("macOS did not return an alias target: " + source.fsName);
                target = File(String(resolvedURI).replace(/^file:\/\//, ""));
            }
        }
        if (!target || !target.exists) throw new Error("Script target not found: " + source.fsName);
        return target;
    }

    function read(key) {
        var value = app.extractLabel(KEY + key), result = [], parts = value.split("\n");
        for (var i = 0; i < parts.length; i++) if (parts[i]) {
            try { result.push(decodeURIComponent(parts[i])); } catch (_) {}
        }
        return result;
    }
    function save(key, values) {
        var parts = [];
        for (var i = 0; i < values.length; i++) parts.push(encodeURIComponent(String(values[i])));
        app.insertLabel(KEY + key, parts.join("\n"));
    }
    function index(a, value) { for (var i = 0; i < a.length; i++) if (a[i] === value) return i; return -1; }
    function name(f) { try { return decodeURIComponent(f.name); } catch (_) { return f.name; } }
    function norm(s) {
        return String(s).toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
            .replace(/[^a-z0-9\u00c0-\uffff]+/g, " ").replace(/^\s+|\s+$/g, "");
    }
    // Natural name order: numbered steps sort 1, 2, 10, not 1, 10, 2.
    function compareRaw(a, b) {
        a = String(a); b = String(b);
        for (var i = 0; i < Math.min(a.length, b.length); i++) {
            var delta = a.charCodeAt(i) - b.charCodeAt(i);
            if (delta) return delta < 0 ? -1 : 1;
        }
        return a.length - b.length;
    }
    function compareText(a, b) {
        var x = String(a).toLowerCase().replace(/^[\s▲★•_-]+/, "").match(/\d+|\D+/g) || [];
        var y = String(b).toLowerCase().replace(/^[\s▲★•_-]+/, "").match(/\d+|\D+/g) || [];
        for (var i = 0; i < Math.min(x.length, y.length); i++) {
            if (compareRaw(x[i], y[i]) === 0) continue;
            if (/^\d+$/.test(x[i]) && /^\d+$/.test(y[i])) {
                var difference = Number(x[i]) - Number(y[i]);
                if (difference) return difference < 0 ? -1 : 1;
            } else return compareRaw(x[i], y[i]);
        }
        return x.length - y.length;
    }
    function compareCategory(a, b) {
        var x = a.split("/"), y = b.split("/");
        for (var i = 0; i < Math.min(x.length, y.length); i++) {
            var c = compareText(x[i], y[i]); if (c) return c;
        }
        return x.length - y.length;
    }
    // Explicit stable merge sort: do not rely on host Array.sort for records.
    function ordered(items, compare) {
        if (items.length < 2) return items.slice(0);
        var half = Math.floor(items.length / 2);
        var left = ordered(items.slice(0, half), compare), right = ordered(items.slice(half), compare);
        var result = [], i = 0, j = 0;
        while (i < left.length && j < right.length) {
            if (compare(left[i], right[j]) <= 0) result.push(left[i++]); else result.push(right[j++]);
        }
        while (i < left.length) result.push(left[i++]);
        while (j < right.length) result.push(right[j++]);
        return result;
    }
    function compareRecord(a, b) {
        var c = sortMode === "category" ? compareCategory(a.category, b.category) : 0;
        if (!c) c = compareText(a.title, b.title);
        if (!c) c = compareRaw(a.path, b.path);
        return c;
    }
    var sortMode = read("sort")[0] === "category" ? "category" : "name";
    var roots = read("roots"), favorites = read("favorites"), recent = read("recent");
    var records = [], categories = [], warnings = [], busy = false;
    var restoringUI = true, savedUI = readUIState(), collapsed = false, folding = false;
    var expandedSize = null, descriptionCache = {};
    function readUIState() {
        var value = app.extractLabel(KEY + "uiState");
        if (!value) return [];
        var parts = value.split("\n");
        try { for (var i=0;i<parts.length;i++) parts[i]=decodeURIComponent(parts[i]); }
        catch (_) { return []; }
        return parts;
    }
    function persistUI() {
        if (restoringUI) return;
        var r = selected(), pinned = selectedPinned();
        save("uiState", [search.text, view.selection ? view.selection.index : 0,
            category.selection ? category.selection.text : "All categories",
            r ? r.path : "", pinned ? pinned.path : "", selectedCollectionItem,
            groupPicker.selection ? groupPicker.selection.text : ""]);
        save("collapsed", [collapsed]);
    }
    function descriptionFor(path) {
        if (!path || isDivider(path)) return "";
        var cacheKey = "$" + path;
        if (descriptionCache.hasOwnProperty(cacheKey)) return descriptionCache[cacheKey];
        var file, description = "";
        try { file = resolveScriptFile(File(path)); } catch (_) { return ""; }
        if (file.exists) {
            file.encoding = "UTF-8";
            if (file.open("r")) {
                try {
                    // Read only the header, including plain-text headers on JSXBIN.
                    var header = file.read(32768);
                    var match = header.match(/(?:^|[\r\n])\uFEFF?\s*\/\/\s*DESCRIPTION\s*:\s*([^\r\n]*)/i);
                    if (match) description = match[1].replace(/^\s+|\s+$/g, "");
                } finally { file.close(); }
            }
        }
        descriptionCache[cacheKey] = description;
        return description;
    }
    function showDescription(path, title, source) {
        var text = descriptionFor(path);
        descriptionTitle.text = title ? source + ": " + title : "Script description";
        descriptionText.text = text || (path ? "No //DESCRIPTION: header found." : "Select a script to read its description.");
        descriptionText.helpTip = text || descriptionText.text;
    }
    if (!roots.length) {
        var defaultRoot = self.parent;
        if (name(defaultRoot) !== "Scripts Panel") {
            defaultRoot = Folder("~/Library/Preferences/Adobe InDesign/Version " + parseInt(app.version, 10) + ".0/en_US/Scripts/Scripts Panel");
        }
        if (!defaultRoot.exists) defaultRoot = Folder.selectDialog("Choose your main scripts folder");
        if (!defaultRoot) return;
        roots.push(defaultRoot.fsName); save("roots", roots);
    }

    var win = new Window("palette", "Script Manager · takeiteasy.dk", undefined, {resizeable: true});
    win.orientation = "column"; win.alignChildren = ["fill", "top"]; win.spacing = 6; win.margins = 10;
    var foldButton = win.add("button", undefined, "- Script Manager");
    foldButton.preferredSize = [156, 24];
    foldButton.helpTip = "Collapse palette";
    var body = win.add("group"); body.orientation = "row"; body.alignChildren = ["fill", "fill"];
    var library = body.add("group"); library.orientation = "column";
    var sidebar = body.add("group"); sidebar.orientation = "column";
    var favoritesPanel = sidebar.add("panel", undefined, "Favorites");
    favoritesPanel.orientation = "column"; favoritesPanel.alignChildren = ["fill", "top"];
    favoritesPanel.margins = 10; favoritesPanel.spacing = 6;
    var pinnedList = favoritesPanel.add("listbox", undefined, []);
    pinnedList.alignment = ["fill", "fill"]; pinnedList.preferredSize = [300, 130];
    var pinnedDetail = favoritesPanel.add("statictext", undefined, "Use Favorite in the script library.", {truncate:"middle"});
    pinnedDetail.preferredSize = [300, 18];
    var pinnedActions = favoritesPanel.add("group"); pinnedActions.spacing = 6;
    var pinnedRun = pinnedActions.add("button", undefined, "Run"),
        pinnedRemove = pinnedActions.add("button", undefined, "Unfavorite");
    var pinnedUp = pinnedActions.add("button", undefined, "↑"),
        pinnedDown = pinnedActions.add("button", undefined, "↓");
    pinnedUp.helpTip = "Move selected favorite up";
    pinnedDown.helpTip = "Move selected favorite down";
    var favoriteOrderInitialized = read("favoriteManualOrder")[0] === "true";
    var updatingPinned = false;
    var collectionPanel = sidebar.add("panel", undefined, "Collections");
    collectionPanel.orientation = "column"; collectionPanel.alignChildren = ["fill", "top"];
    collectionPanel.margins = 10; collectionPanel.spacing = 6;
    var collectionsVisible = read("collectionsVisible")[0] !== "false";
    var searchRow = library.add("group");
    searchRow.spacing = 6;
    var search = searchRow.add("edittext", undefined, "");
    search.preferredSize.width = 376;
    search.helpTip = "Search script names and folder paths. Multiple words narrow the results.";
    var clearSearch = searchRow.add("button", undefined, "×");
    clearSearch.preferredSize = [28, 24];
    clearSearch.helpTip = "Clear search";
    var filters = library.add("group"); filters.alignChildren = ["fill", "center"];
    var view = filters.add("dropdownlist", undefined, ["All scripts", "Favorites", "Recent"]); view.selection = 0; view.preferredSize.width = 112; view.alignment = ["left", "center"];
    view.helpTip = "Ctrl+1: All scripts | Ctrl+2: Favorites | Ctrl+3: Recent. Switching views clears the search.";
    var category = filters.add("dropdownlist", undefined, ["All categories"]); category.selection = 0; category.preferredSize.width = 285; category.minimumSize.width = 160; category.alignment = ["fill", "center"];
    var list = library.add("listbox", undefined, [], {multiselect: false});
    list.alignment = ["fill", "fill"]; list.preferredSize = [410, 245]; list.minimumSize = [300, 100];
    var detail = library.add("statictext", undefined, "", {truncate: "middle"}); detail.preferredSize = [410, 18]; detail.minimumSize = [0, 18];
    var actions = library.add("group"); actions.spacing = 6;
    var run = actions.add("button", undefined, "Run"), star = actions.add("button", undefined, "Favorite"), reveal = actions.add("button", undefined, "Open folder");
    run.preferredSize.width = 60; star.preferredSize.width = 100; reveal.preferredSize.width = 105;
    var footer = library.add("group"); footer.spacing = 6;
    var folders = footer.add("button", undefined, "Folders…"), refresh = footer.add("button", undefined, "Refresh");
    var collectionsToggle = footer.add("button", undefined, "Collections");
    var settingsButton = footer.add("button", undefined, "Settings…");
    settingsButton.helpTip = "Export or import Favorites, Collections and script folder settings.";
    var status = footer.add("statictext", undefined, ""); status.alignment = ["fill", "center"];
    var sorting = library.add("group"); sorting.spacing = 6;
    sorting.add("statictext", undefined, "Sort:");
    var byName = sorting.add("radiobutton", undefined, "Name"), byCategory = sorting.add("radiobutton", undefined, "Category");
    byName.value = sortMode === "name"; byCategory.value = sortMode === "category";
    byName.helpTip = "Natural name order: 1, 2, 10. Ignores case and leading decorative symbols.";
    byCategory.helpTip = "Group by folder path, then sort script names within each folder.";
    var quickViews = library.add("group"); quickViews.spacing = 6;
    var allViewButton = quickViews.add("button", undefined, "All scripts"),
        favoriteViewButton = quickViews.add("button", undefined, "Favorites"),
        recentViewButton = quickViews.add("button", undefined, "Recent");
    allViewButton.helpTip = "All scripts — Control+1 (Ctrl, not Command). Clears search and category filter.";
    favoriteViewButton.helpTip = "Favorites — Control+2 (Ctrl, not Command). Clears search and category filter.";
    recentViewButton.helpTip = "Recent — Control+3 (Ctrl, not Command). Clears search and category filter.";
    var descriptionPanel = win.add("group");
    descriptionPanel.orientation = "column"; descriptionPanel.alignChildren = "fill";
    var descriptionTitle = descriptionPanel.add("statictext", undefined, "Script description", {truncate:"end"});
    var descriptionText = descriptionPanel.add("edittext", undefined, "Select a script to read its description.", {multiline:true, readonly:true, scrolling:true});
    descriptionText.preferredSize = [760, 48];
    win.minimumSize = [350, 275];

    var dividerText = "────────────────────────";
    function isDivider(path) { return String(path || "").indexOf("sm-divider:") === 0; }
    function dividerID() { return "sm-divider:" + newID(); }
    var pinnedDivider = pinnedActions.add("button", undefined, "+ Divider");
    pinnedDivider.helpTip = "Insert a divider after the selected favorite, or at the end.";
    // This list is independent of library search, category, view and selection.
    function selectedPinned() { return pinnedList.selection ? pinnedList.selection.record : null; }
    function pinnedSelectionChanged() {
        var r = selectedPinned();
        pinnedRun.enabled = !!r && !isDivider(r.path) && File(r.path).exists && !busy;
        pinnedDivider.enabled = !busy;
        pinnedRemove.text = r && isDivider(r.path) ? "Remove" : "Unfavorite";
        pinnedRemove.enabled = !!r && !busy;
        var position = r ? index(favorites, r.path) : -1;
        pinnedUp.enabled = !busy && position > 0;
        pinnedDown.enabled = !busy && position >= 0 && position < favorites.length - 1;
        pinnedDetail.text = r && isDivider(r.path) ? "Divider" : r ? (File(r.path).exists ? r.category : "Missing script — remove or restore its file.") : "Use Favorite in the script library.";
        pinnedList.helpTip = ""; // Avoid misplaced ScriptUI tooltips on secondary monitors.
        pinnedDetail.helpTip = r && isDivider(r.path) ? "Move with the arrows or remove this divider." : r ? r.path : "Favorites stay visible while you browse other scripts.";
    }
    function renderPinned() {
        var previous = selectedPinned(), keep = previous ? previous.path : "", rows = [];
        for (var i = 0; i < favorites.length; i++) {
            var path = favorites[i], record = null;
            if (isDivider(path)) { rows.push({title:dividerText,path:path,category:""}); continue; }
            for (var j = 0; j < records.length; j++) if (records[j].path === path) { record = records[j]; break; }
            if (!record) {
                var f = File(path);
                record = {title:name(f).replace(/\.(jsx|jsxbin)$/i,""), path:path, folder:f.parent.fsName, category:f.parent.fsName};
            }
            rows.push(record);
        }
        // Preserve the previous alphabetical display on first upgrade, then
        // use the saved manual order. Newly added favorites append at the end.
        if (!favoriteOrderInitialized) {
            rows = ordered(rows, function(a,b) { var c = compareText(a.title,b.title); return c || compareRaw(a.path,b.path); });
            favorites = [];
            for (var fIndex = 0; fIndex < rows.length; fIndex++) favorites.push(rows[fIndex].path);
            save("favorites", favorites); save("favoriteManualOrder", ["true"]);
            favoriteOrderInitialized = true;
        }
        updatingPinned = true; pinnedList.removeAll();
        for (var k = 0; k < rows.length; k++) {
            var r = rows[k], duplicate = false;
            for (var d = 0; d < rows.length; d++) if (d !== k && rows[d].title === r.title) { duplicate = true; break; }
            var label = isDivider(r.path) ? dividerText : (File(r.path).exists ? "" : "[Missing] ") + r.title;
            if (duplicate && !isDivider(r.path)) label += "  [" + r.category.replace(/^[^\/]+ \/ /, "") + "]";
            var row = pinnedList.add("item", label); row.record = r;
            if (r.path === keep) pinnedList.selection = row;
        }
        if (!pinnedList.selection && pinnedList.items.length) pinnedList.selection = 0;
        var scriptCount = 0;
        for (var countIndex = 0; countIndex < rows.length; countIndex++) if (!isDivider(rows[countIndex].path)) scriptCount++;
        favoritesPanel.text = "Favorites (" + scriptCount + ")";
        updatingPinned = false; pinnedSelectionChanged();
    }
    function movePinned(direction) {
        var r = selectedPinned(); if (!r || busy) return;
        var from = index(favorites, r.path), to = from + direction;
        if (from < 0 || to < 0 || to >= favorites.length) return;
        var other = favorites[to]; favorites[to] = favorites[from]; favorites[from] = other;
        save("favorites", favorites);
        renderPinned();
        if (pinnedList.selection) pinnedList.revealItem(pinnedList.selection);
    }
    pinnedDivider.onClick = function () {
        if (busy) return;
        var r = selectedPinned(), position = r ? index(favorites, r.path) + 1 : favorites.length;
        favorites.splice(position, 0, dividerID()); save("favorites", favorites);
        renderPinned(); pinnedList.selection = position; pinnedSelectionChanged();
        pinnedList.revealItem(pinnedList.selection);
    };
    pinnedUp.onClick = function () { movePinned(-1); };
    pinnedDown.onClick = function () { movePinned(1); };
    pinnedList.onChange = function () { if (!updatingPinned) { pinnedSelectionChanged(); var r=selectedPinned(); showDescription(r&&!isDivider(r.path)?r.path:"", r?r.title:"", "Favorites"); persistUI(); } };
    function runPinned() { var r=selectedPinned(); if (r && !isDivider(r.path) && !busy) runRecord(r, true); }
    pinnedRun.onClick = runPinned; pinnedList.onDoubleClick = runPinned;
    pinnedList.addEventListener("keydown", function(e) { if(e.keyName === "Enter") { runPinned(); e.preventDefault(); } });
    pinnedRemove.onClick = function () {
        var r = selectedPinned(); if (!r || busy) return;
        var p = index(favorites,r.path); if(p < 0) return;
        favorites.splice(p,1); save("favorites",favorites);
        // Only rebuild the main list if it is itself showing Favorites.
        if(view.selection.index === 1) render();
        else { updateLibraryStars(); selectionChanged(); renderPinned(); }
    };
    function updateLibraryStars() {
        for(var i=0;i<list.items.length;i++) {
            var row=list.items[i], r=row.record;
            var prefix=sortMode === "category" && view.selection.index !== 2 ? "["+r.category.replace(/^[^\/]+ \/ /,"")+"]  " : "";
            row.text=(index(favorites,r.path)>=0?"★ ":"")+prefix+r.title;
        }
    }

    // Collections use a versioned, URI-escaped text format; never evaluate stored data.
    function newID() { return "c" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000000); }
    function encodeFields(fields) {
        var out = []; for (var i = 0; i < fields.length; i++) out.push(encodeURIComponent(String(fields[i])));
        return out.join("\t");
    }
    function collectionData(text) {
        var result = [], lines = String(text || "").split("\n"), current = null;
        if (lines[0] !== "SM_COLLECTIONS_1") return result;
        for (var i = 1; i < lines.length; i++) {
            if (!lines[i]) continue;
            var raw = lines[i].split("\t"), f = [], j;
            try { for (j = 0; j < raw.length; j++) f.push(decodeURIComponent(raw[j])); } catch (_) { continue; }
            if (f[0] === "C" && f.length === 4) { current = {id:f[1], name:f[2], note:f[3], groups:[], items:[]}; result.push(current); }
            else if (current && f[0] === "G" && f.length === 2 && index(current.groups,f[1]) < 0) current.groups.push(f[1]);
            else if (current && f[0] === "I" && f.length === 7) {
                if (index(current.groups,f[2]) < 0) current.groups.push(f[2]);
                current.items.push({title:f[1], group:f[2], note:f[3], root:f[4], relative:f[5], path:f[6]});
            }
        }
        for (var k = 0; k < result.length; k++) if (!result[k].groups.length) result[k].groups.push("General");
        return result;
    }
    function serializeCollections(data) {
        var lines = ["SM_COLLECTIONS_1"];
        for (var i = 0; i < data.length; i++) {
            var c = data[i]; lines.push(encodeFields(["C",c.id,c.name,c.note]));
            for (var g = 0; g < c.groups.length; g++) lines.push(encodeFields(["G",c.groups[g]]));
            for (var j = 0; j < c.items.length; j++) { var t=c.items[j]; lines.push(encodeFields(["I",t.title,t.group,t.note,t.root,t.relative,t.path])); }
        }
        return lines.join("\n");
    }
    var collections = collectionData(app.extractLabel(KEY + "collectionsData"));
    var activeCollectionID = read("activeCollection")[0] || "", selectedCollectionItem = -1, updatingCollections = false;
    function currentCollection() {
        for (var i=0;i<collections.length;i++) if(collections[i].id===activeCollectionID)return collections[i];
        return collections.length ? collections[0] : null;
    }
    function persistCollections() { app.insertLabel(KEY+"collectionsData",serializeCollections(collections)); save("activeCollection",[activeCollectionID]); }
    var collectionHeader = collectionPanel.add("group"); collectionHeader.alignChildren = ["fill","center"];
    var collectionPicker = collectionHeader.add("dropdownlist",undefined,[]); collectionPicker.alignment=["fill","center"]; collectionPicker.preferredSize.width=185;
    var openCollection = collectionHeader.add("button", undefined, "Open All");
    openCollection.helpTip = "Run every linked script in this collection. Use a collection of panel scripts to open them together.";
    var manageCollections = collectionHeader.add("button",undefined,"Manage…");
    var collectionNote = collectionPanel.add("edittext",undefined,"",{multiline:true}); collectionNote.preferredSize.height=48; collectionNote.helpTip="Note for this collection. Saved automatically.";
    var collectionList = collectionPanel.add("listbox",undefined,[]); collectionList.alignment=["fill","fill"]; collectionList.preferredSize=[300,230]; collectionList.minimumSize.height=90;
    var groupRow=collectionPanel.add("group");groupRow.alignChildren=["fill","center"];
    var groupPicker=groupRow.add("dropdownlist",undefined,[]);groupPicker.alignment=["fill","center"];groupPicker.preferredSize.width=170;
    groupPicker.helpTip="Group for the selected entry, or for a new script.";
    var groupManage=groupRow.add("button",undefined,"Groups…");
    var collectionActions=collectionPanel.add("group");
    var collectionRun=collectionActions.add("button",undefined,"Run"), moveUp=collectionActions.add("button",undefined,"↑"), moveDown=collectionActions.add("button",undefined,"↓"), removeEntry=collectionActions.add("button",undefined,"Remove");
    var collectionDivider=collectionActions.add("button",undefined,"+ Divider");
    collectionDivider.helpTip="Insert a divider after the selected entry, or at the end of the selected group.";
    moveUp.preferredSize.width=32;moveDown.preferredSize.width=32;
    var entryLabel=collectionPanel.add("statictext",undefined,"Script note",{truncate:"end"});
    var entryNote=collectionPanel.add("edittext",undefined,"",{multiline:true});entryNote.preferredSize.height=70;
    entryNote.helpTip="Note for this script in this collection. Saved automatically.";
    var locateEntry=collectionPanel.add("button",undefined,"Locate missing script…");
    var addToCollection=actions.add("button",undefined,"Add →");addToCollection.helpTip="Add selected library script to the current collection and group.";
    function entry() { var c=currentCollection();return c && selectedCollectionItem>=0 ? c.items[selectedCollectionItem] : null; }
    function resolvedEntry(t) {
        if (!t || isDivider(t.path)) return null;
        // Never silently substitute another root's same-named script.
        var candidate = t.root && t.relative ? File(t.root + "/" + t.relative) : File(t.path);
        if(candidate.exists)return candidate;
        candidate=File(t.path);return candidate.exists ? candidate : null;
    }
    function setEntryPath(t,f) {
        t.path=f.fsName;t.root="";t.relative="";
        var best="";
        for(var i=0;i<roots.length;i++){var base=Folder(roots[i]).fsName;if(f.fsName.indexOf(base+"/")===0&&base.length>best.length)best=base;}
        if(best){t.root=best;t.relative=f.fsName.substring(best.length+1);}
    }
    function collectionSelectionChanged() {
        var t=entry(), c=currentCollection();
        openCollection.enabled = false;
        if (c && !busy) {
            for (var j = 0; j < c.items.length; j++) {
                if (!isDivider(c.items[j].path)) {
                    openCollection.enabled = true;
                    break;
                }
            }
        }
        collectionRun.enabled=!!resolvedEntry(t)&&!busy;moveUp.enabled=moveDown.enabled=removeEntry.enabled=!!t&&!busy;
        locateEntry.enabled=!!t&&!isDivider(t.path)&&!busy;collectionDivider.enabled=!!c&&!busy;locateEntry.text=resolvedEntry(t)?"Change linked script…":"Locate missing script…";
        entryNote.enabled=!!t&&!isDivider(t.path);entryNote.text=t?t.note:"";entryLabel.text=t?(isDivider(t.path)?"Divider":t.title):"Script note";
        collectionList.helpTip="";
        entryLabel.helpTip=t&&!isDivider(t.path)?t.path:"";collectionNote.enabled=!!c;groupManage.enabled=!!c&&!busy;
        if(t){for(var i=0;i<groupPicker.items.length;i++)if(groupPicker.items[i].text===t.group)groupPicker.selection=i;}
        addToCollection.enabled=!!c&&!!selected()&&!busy;
    }
    function renderCollection() {
        updatingCollections=true;
        var c=currentCollection(), oldGroup=groupPicker.selection?groupPicker.selection.text:"";
        collectionPicker.removeAll();
        for(var i=0;i<collections.length;i++){var r=collectionPicker.add("item",collections[i].name);r.collectionID=collections[i].id;if(c===collections[i])collectionPicker.selection=i;}
        if(c)activeCollectionID=c.id;
        collectionNote.text=c?c.note:"Create a collection with Manage…";
        groupPicker.removeAll();collectionList.removeAll();
        if(c){
            for(var g=0;g<c.groups.length;g++){
                groupPicker.add("item",c.groups[g]);if(c.groups[g]===oldGroup)groupPicker.selection=g;
                var header=collectionList.add("item","— "+c.groups[g]+" —");header.entryIndex=-1;
                for(var j=0;j<c.items.length;j++)if(c.items[j].group===c.groups[g]){
                    var t=c.items[j], row=collectionList.add("item",isDivider(t.path)?dividerText:(resolvedEntry(t)?"":"[Missing] ")+t.title+(t.note?"  •":""));row.entryIndex=j;
                    if(j===selectedCollectionItem)collectionList.selection=row;
                }
            }
            if(!groupPicker.selection&&groupPicker.items.length)groupPicker.selection=0;
        }
        updatingCollections=false;collectionSelectionChanged();
    }
    collectionPicker.onChange=function(){if(updatingCollections||!collectionPicker.selection)return;activeCollectionID=collectionPicker.selection.collectionID;selectedCollectionItem=-1;renderCollection();persistCollections();};
    collectionList.onChange=function(){if(updatingCollections)return;selectedCollectionItem=collectionList.selection?collectionList.selection.entryIndex:-1;collectionSelectionChanged();var t=entry(),f=resolvedEntry(t);showDescription(f?f.fsName:"",t?t.title:"","Collections");persistUI();};
    collectionNote.onChanging=function(){if(updatingCollections)return;var c=currentCollection();if(c){c.note=collectionNote.text;persistCollections();}};
    entryNote.onChanging=function(){var t=entry();if(t&&!updatingCollections){t.note=entryNote.text;persistCollections();}};
    entryNote.onChange=function(){renderCollection();};
    groupPicker.onChange=function(){if(updatingCollections||!groupPicker.selection)return;var t=entry();if(t){t.group=groupPicker.selection.text;persistCollections();renderCollection();}};
    addToCollection.onClick=function(){var r=selected(),c=currentCollection();if(!r||!c||busy)return;var t={title:r.title,group:groupPicker.selection?groupPicker.selection.text:c.groups[0],note:"",root:"",relative:"",path:""};setEntryPath(t,File(r.path));c.items.push(t);selectedCollectionItem=c.items.length-1;persistCollections();renderCollection();if(!collectionsVisible)collectionsToggle.onClick();};
    collectionDivider.onClick=function(){
        var c=currentCollection(),t=entry();if(!c||busy)return;
        var group=t?t.group:(groupPicker.selection?groupPicker.selection.text:c.groups[0]);
        var position=t?selectedCollectionItem+1:c.items.length;
        if(!t){for(var i=c.items.length-1;i>=0;i--)if(c.items[i].group===group){position=i+1;break;}}
        c.items.splice(position,0,{title:dividerText,group:group,note:"",root:"",relative:"",path:dividerID()});
        selectedCollectionItem=position;persistCollections();renderCollection();
        if(collectionList.selection)collectionList.revealItem(collectionList.selection);
    };
    function runCollectionEntry(){var t=entry(),f=resolvedEntry(t);if(!f||busy)return;runRecord({title:t.title,path:f.fsName}, true);}
    openCollection.onClick = function () {
        var c = currentCollection();
        if (!c || busy) return;
        var items = c.items.slice(0), opened = {}, problems = [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (isDivider(item.path)) continue;
            var file = resolvedEntry(item);
            if (!file) {
                problems.push(item.title + " (missing script)");
                continue;
            }
            if (opened[file.fsName]) continue;
            opened[file.fsName] = true;
            runRecord({title: item.title, path: file.fsName}, true, problems);
        }
        if (problems.length) alert("Some scripts could not be opened:\n\n" + problems.join("\n\n"));
    };
    collectionRun.onClick=runCollectionEntry;collectionList.onDoubleClick=runCollectionEntry;
    collectionList.addEventListener("keydown",function(e){if(e.keyName==="Enter"){runCollectionEntry();e.preventDefault();}});
    function moveEntry(direction){var c=currentCollection(),t=entry();if(!t||busy)return;var j=selectedCollectionItem+direction;while(j>=0&&j<c.items.length&&c.items[j].group!==t.group)j+=direction;if(j<0||j>=c.items.length)return;c.items[selectedCollectionItem]=c.items[j];c.items[j]=t;selectedCollectionItem=j;persistCollections();renderCollection();}
    moveUp.onClick=function(){moveEntry(-1);};moveDown.onClick=function(){moveEntry(1);};
    removeEntry.onClick=function(){var c=currentCollection();if(!entry()||busy)return;c.items.splice(selectedCollectionItem,1);selectedCollectionItem=-1;persistCollections();renderCollection();};
    locateEntry.onClick=function(){var t=entry();if(!t||isDivider(t.path)||busy)return;var f=File.openDialog("Locate script",function(x){return x instanceof Folder||/\.(jsx|jsxbin)$/i.test(x.name);});if(!f)return;if(!/\.(jsx|jsxbin)$/i.test(f.name)){alert("Choose a JSX or JSXBIN script.");return;}setEntryPath(t,f);persistCollections();renderCollection();};
    function askName(title,initial){var value=prompt(title,initial||"");return value===null?null:value.replace(/^\s+|\s+$/g,"");}
    manageCollections.onClick=function(){
        if(busy)return;
        var d=new Window("dialog","Manage collections");d.orientation="column";d.alignChildren="fill";
        var buttons=["New collection","Rename collection","Duplicate collection","Delete collection"];
        for(var i=0;i<buttons.length;i++){var b=d.add("button",undefined,buttons[i]);b.action=i;b.enabled=i===0||!!currentCollection();b.onClick=function(){d.close(this.action+1);};}
        var cancelButton=d.add("button",undefined,"Cancel",{name:"cancel"});cancelButton.onClick=function(){d.close(0);};var choice=d.show(),c=currentCollection(),n,j;
        if(choice===1){n=askName("Collection name");if(n){c={id:newID(),name:n,note:"",groups:["General"],items:[]};collections.push(c);activeCollectionID=c.id;}}
        else if(choice===2&&c){n=askName("Collection name",c.name);if(n)c.name=n;}
        else if(choice===3&&c){n=askName("Name for duplicate",c.name+" copy");if(n){var clone=collectionData(serializeCollections([c]))[0];clone.id=newID();clone.name=n;collections.push(clone);activeCollectionID=clone.id;}}
        else if(choice===4&&c){if(!confirm("Delete collection '"+c.name+"'? Scripts on disk are not deleted."))return;for(j=0;j<collections.length;j++)if(collections[j]===c){collections.splice(j,1);break;}activeCollectionID="";}
        else return;
        selectedCollectionItem=-1;persistCollections();renderCollection();
    };
    groupManage.onClick=function(){
        var c=currentCollection();if(!c||busy)return;var old=groupPicker.selection?groupPicker.selection.text:c.groups[0];
        var d=new Window("dialog","Groups");d.orientation="column";d.alignChildren="fill";
        var opts=["New group","Rename selected group","Move group up","Move group down","Remove empty group"];
        for(var i=0;i<opts.length;i++){var b=d.add("button",undefined,opts[i]);b.action=i;b.onClick=function(){d.close(this.action+1);};}var cancelButton=d.add("button",undefined,"Cancel",{name:"cancel"});cancelButton.onClick=function(){d.close(0);};
        var action=d.show(),n,j,k=index(c.groups,old);
        if(action===1){n=askName("Group name");if(!n)return;if(index(c.groups,n)>=0){alert("That group already exists.");return;}c.groups.push(n);}
        else if(action===2){n=askName("Group name",old);if(!n||n===old)return;if(index(c.groups,n)>=0){alert("That group already exists.");return;}c.groups[k]=n;for(j=0;j<c.items.length;j++)if(c.items[j].group===old)c.items[j].group=n;}
        else if(action===3||action===4){j=k+(action===3?-1:1);if(j<0||j>=c.groups.length)return;c.groups[k]=c.groups[j];c.groups[j]=old;}
        else if(action===5){if(c.groups.length===1){alert("Keep at least one group.");return;}for(j=0;j<c.items.length;j++)if(c.items[j].group===old){alert("Move or remove the group's entries first.");return;}c.groups.splice(k,1);}
        else return;persistCollections();renderCollection();
    };
    collectionsToggle.onClick=function(){collectionsVisible=!collectionsVisible;save("collectionsVisible",[collectionsVisible]);resizeContents();geometry();};

    function selected() { return list.selection ? list.selection.record : null; }
    function selectionChanged() {
        var r = selected(); run.enabled = star.enabled = reveal.enabled = !!r && !busy;
        star.text = r && index(favorites, r.path) >= 0 ? "Unfavorite" : "Favorite";
        if (addToCollection) addToCollection.enabled = !!currentCollection() && !!r && !busy;
        detail.text = r ? r.category : "Select a script"; detail.helpTip = r ? r.path : "";
        list.helpTip = "";
        showDescription(r ? r.path : "", r ? r.title : "", "Library");
        persistUI();
    }
    function render(prefer) {
        clearSearch.enabled = search.text.length > 0;
        var old = selected(), keep = prefer || (old ? old.path : "");
        var words = norm(search.text).split(/\s+/), mode = view.selection.index;
        var cat = category.selection ? category.selection.index : 0, visible = [], i, j;
        for (i = 0; i < records.length; i++) {
            var r = records[i];
            if (mode === 1 && index(favorites, r.path) < 0) continue;
            if (mode === 2 && index(recent, r.path) < 0) continue;
            if (cat > 0 && r.category !== categories[cat - 1]) continue;
            var matches = true;
            for (j = 0; j < words.length; j++) if (r.search.indexOf(words[j]) < 0) { matches = false; break; }
            if (matches) visible.push(r);
        }
        visible = ordered(visible, mode === 2 ? function (a, b) { return index(recent, a.path) - index(recent, b.path); } : compareRecord);
        quickViews.enabled = !busy;
        allViewButton.text = (mode === 0 ? "• " : "") + "All scripts";
        favoriteViewButton.text = (mode === 1 ? "• " : "") + "Favorites";
        recentViewButton.text = (mode === 2 ? "• " : "") + "Recent";
        sorting.enabled = mode !== 2;
        sorting.helpTip = mode === 2 ? "Recent always shows the last-run script first." : "";
        list.removeAll(); var chosen = null;
        for (i = 0; i < visible.length; i++) {
            var prefix = sortMode === "category" && mode !== 2 ? "[" + visible[i].category.replace(/^[^\/]+ \/ /, "") + "]  " : "";
            var item = list.add("item", (index(favorites, visible[i].path) >= 0 ? "★ " : "") + prefix + visible[i].title);
            item.record = visible[i];
            if (visible[i].path === keep) chosen = item;
        }
        if (chosen) list.selection = chosen; else if (list.items.length) list.selection = 0;
        status.text = visible.length + " / " + records.length + (warnings.length ? "  !" : "");
        status.helpTip = warnings.length ? warnings.join("\n") : "Scripts shown / total. Refresh after adding or moving files.";
        selectionChanged(); renderPinned();
    }
    function scan() {
        var oldCategory = category.selection ? category.selection.text : "All categories";
        descriptionCache = {};
        records = []; categories = []; warnings = []; var visited = {}, seen = {};
        function walk(dir, rootName, relative) {
            var id = "$" + dir.fsName;
            if (visited[id]) return; visited[id] = true;
            var files;
            try { files = dir.getFiles(); } catch (e) { warnings.push("Cannot read: " + dir.fsName); return; }
            for (var i = 0; i < files.length; i++) {
                var f = files[i], n = name(f);
                if (n.charAt(0) === ".") continue;
                // Include aliases to scripts, but do not traverse folder aliases.
                var target = f;
                if (f instanceof File || f.alias) {
                    try { target = resolveScriptFile(f); }
                    catch (e) { warnings.push("Cannot resolve/read: " + f.fsName + " — " + e.message); continue; }
                    if (target instanceof Folder) continue;
                }
                if (f instanceof Folder) { walk(f, rootName, relative ? relative + "/" + n : n); continue; }
                if (!/\.(jsx|jsxbin)$/i.test(name(target)) || target.fsName === self.fsName || seen["$" + f.fsName]) continue;
                seen["$" + f.fsName] = true;
                var cat = rootName + (relative ? " / " + relative : " / (root)");
                if (index(categories, cat) < 0) categories.push(cat);
                records.push({title: n.replace(/\.(jsx|jsxbin)$/i, ""), path: f.fsName, folder: f.parent.fsName, category: cat, search: norm(n + " " + cat)});
            }
        }
        for (var i = 0; i < roots.length; i++) {
            var root = Folder(roots[i]);
            if (root.exists) walk(root, name(root) + (roots.length > 1 ? " [" + (i + 1) + "]" : ""), "");
            else warnings.push("Missing folder: " + roots[i]);
        }
        categories = ordered(categories, compareCategory); category.removeAll(); category.add("item", "All categories");
        var selectedCategory = 0;
        for (i = 0; i < categories.length; i++) { category.add("item", categories[i]); if (categories[i] === oldCategory) selectedCategory = i + 1; }
        category.selection = selectedCategory; render(); renderCollection();
    }
    function runSelected() {
        var r = selected(); if (!r || busy) return;
        runRecord(r);
    }
    function runRecord(r, preserveLibrary, problems) {
        function report(message) {
            if (problems) problems.push(message);
            else alert(message);
        }
        if (!r || busy) return;
        var file = File(r.path);
        try { file = resolveScriptFile(file); }
        catch (e) { report("Could not resolve " + r.title + ":\n" + e.message); return; }
        if (!file || !(file instanceof File) || !file.exists) { report("Script no longer exists:\n" + r.path + "\n\nClick Refresh to update the list."); return; }
        busy = true; selectionChanged(); collectionSelectionChanged(); pinnedSelectionChanged();
        try {
            app.doScript(file, ScriptLanguage.JAVASCRIPT);
            var p = index(recent, r.path); if (p >= 0) recent.splice(p, 1);
            recent.unshift(r.path); if (recent.length > 30) recent.length = 30; save("recent", recent);
        } catch (e) { report("Could not run " + r.title + ":\n" + e.message + (e.line ? "\nLine: " + e.line : "")); }
        finally {
            busy = false;
            // Do not rebuild the library when a sidebar script runs: preserve scroll too.
            if (preserveLibrary) selectionChanged(); else render(r.path);
            collectionSelectionChanged(); pinnedSelectionChanged();
        }
    }
    function editFolders() {
        var dlg = new Window("dialog", "Script folders"), work = roots.slice(0);
        dlg.orientation = "column"; dlg.alignChildren = "fill";
        dlg.add("statictext", undefined, "Subfolders and script aliases are included. Folder aliases and hidden folders are skipped.");
        var rows = dlg.add("listbox", undefined, work); rows.preferredSize = [560, 170];
        var tools = dlg.add("group"), add = tools.add("button", undefined, "Add folder…"), remove = tools.add("button", undefined, "Remove");
        add.onClick = function () { var f = Folder.selectDialog("Add a scripts folder"); if (f && index(work, f.fsName) < 0) { work.push(f.fsName); rows.add("item", f.fsName); } };
        remove.onClick = function () { if (rows.selection) { work.splice(rows.selection.index, 1); rows.remove(rows.selection); } };
        var buttons = dlg.add("group"); buttons.alignment = "right";
        buttons.add("button", undefined, "Cancel", {name: "cancel"}); var ok = buttons.add("button", undefined, "Save", {name: "ok"});
        ok.onClick = function () { if (!work.length) { alert("Keep at least one script folder."); return; } dlg.close(1); };
        if (dlg.show() === 1) { roots = work; save("roots", roots); scan(); }
    }
    search.onChanging = function () { render(); };
    clearSearch.onClick = function () {
        search.text = "";
        render();
        search.active = true;
    };
    search.addEventListener("keydown", function (e) { if (e.keyName === "Down" && list.items.length) { list.active = true; e.preventDefault(); } else if (e.keyName === "Enter") { runSelected(); e.preventDefault(); } });
    list.addEventListener("keydown", function (e) { if (e.keyName === "Enter") { runSelected(); e.preventDefault(); } });
    list.onChange = selectionChanged; list.onDoubleClick = runSelected; run.onClick = runSelected;
    function viewChanged() {
        search.text = "";
        category.selection = 0;
        render();
    }
    function switchView(mode) {
        if (busy) return;
        view.selection = mode;
        viewChanged();
        search.active = true;
    }
    allViewButton.onClick = function () { switchView(0); };
    favoriteViewButton.onClick = function () { switchView(1); };
    recentViewButton.onClick = function () { switchView(2); };
    view.onChange = viewChanged;
    category.onChange = function () { render(); };
    // Capture only inside this palette, including when its search field has focus.
    win.addEventListener("keydown", function (e) {
        if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        var key = String(e.keyName);
        if (key !== "1" && key !== "2" && key !== "3") return;
        e.preventDefault();
        e.stopPropagation();
        switchView(Number(key) - 1);
    }, true);
    star.onClick = function () {
        var r=selected();if(!r||busy)return;
        var p=index(favorites,r.path);if(p<0)favorites.push(r.path);else favorites.splice(p,1);
        save("favorites",favorites);
        if(view.selection.index === 1)render(r.path);
        else { updateLibraryStars(); selectionChanged(); renderPinned(); }
    };
    reveal.onClick = function () { var r = selected(); if (r && !Folder(r.folder).execute()) alert("Could not open folder:\n" + r.folder); };
    folders.onClick = editFolders; refresh.onClick = scan;
    function changeSort(mode) {
        sortMode = mode; byName.value = mode === "name"; byCategory.value = mode === "category";
        save("sort", [mode]); render();
        // Start at the top so the selected sort order is immediately visible.
        if (list.items.length) { list.selection = 0; list.revealItem(list.items[0]); }
    }
    byName.onClick = function () { changeSort("name"); };
    byCategory.onClick = function () { changeSort("category"); };

    // Portable data only: URI-escaped fields, no eval and no script execution.
    var transferKeys = ["roots","favorites","recent","sort","activeCollection","collectionsVisible","favoriteManualOrder"];
    function captureSettings() {
        return {roots:roots.slice(0), favorites:favorites.slice(0), recent:recent.slice(0),
            sort:[sortMode], activeCollection:[activeCollectionID],
            collectionsVisible:[String(collectionsVisible)], favoriteManualOrder:["true"],
            collections:serializeCollections(collections)};
    }
    function encodeSettings(data) {
        var lines=["SM_SETTINGS_1"], i;
        for(i=0;i<transferKeys.length;i++) {
            var key=transferKeys[i]; lines.push(encodeFields([key].concat(data[key])));
        }
        lines.push(encodeFields(["collections",data.collections]));
        lines.push("END_SM_SETTINGS_1");
        return lines.join("\n");
    }
    function decodeSettings(text) {
        var lines=String(text).replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n").split("\n"), data={}, seen={}, i,j;
        while(lines.length && lines[lines.length-1]==="")lines.pop();
        if(lines.shift()!=="SM_SETTINGS_1" || lines.pop()!=="END_SM_SETTINGS_1")throw Error("Not a complete Script Manager settings file.");
        for(i=0;i<lines.length;i++) {
            var raw=lines[i].split("\t"), fields=[];
            for(j=0;j<raw.length;j++)fields.push(decodeURIComponent(raw[j]));
            var key=fields.shift();
            if((index(transferKeys,key)<0 && key!=="collections") || seen["$"+key])throw Error("Unknown or duplicate settings field: "+key);
            seen["$"+key]=true; data[key]=fields;
        }
        for(i=0;i<transferKeys.length;i++)if(!seen["$"+transferKeys[i]])throw Error("Missing settings field: "+transferKeys[i]);
        if(!data.collections || data.collections.length!==1)throw Error("Missing collection data.");
        data.collections=data.collections[0];
        if(!data.roots.length)throw Error("No script folders in settings.");
        for(i=0;i<data.roots.length;i++)if(!data.roots[i] || isDivider(data.roots[i]))throw Error("Invalid script folder.");
        for(i=0;i<2;i++) {
            var values=i?data.recent:data.favorites;
            for(j=0;j<values.length;j++)if(!values[j])throw Error("Empty script reference.");
        }
        if(data.sort.length!==1 || (data.sort[0]!=="name"&&data.sort[0]!=="category"))throw Error("Invalid sort setting.");
        if(data.activeCollection.length!==1)throw Error("Invalid active collection.");
        var booleanKeys=["collectionsVisible","favoriteManualOrder"];
        for(i=0;i<booleanKeys.length;i++){var b=data[booleanKeys[i]];if(b.length!==1||(b[0]!=="true"&&b[0]!=="false"))throw Error("Invalid boolean setting.");}
        // Reject malformed records instead of silently dropping them during import.
        var parsed=collectionData(data.collections);
        if(serializeCollections(parsed)!==data.collections)throw Error("Invalid or unsupported collection data.");
        var ids={};
        for(i=0;i<parsed.length;i++) {
            if(!parsed[i].id || ids["$"+parsed[i].id])throw Error("Invalid collection identifier.");
            ids["$"+parsed[i].id]=true;
            for(j=0;j<parsed[i].items.length;j++)if(!parsed[i].items[j].path)throw Error("Empty collection script reference.");
        }
        return data;
    }
    function writeSettings(file,data) {
        file.encoding="UTF-8";file.lineFeed="Unix";
        if(!file.open("w"))throw Error("Cannot write: "+file.fsName);
        try{if(!file.write(encodeSettings(data)))throw Error("Could not finish writing settings.");}
        finally{file.close();}
    }
    function underRoot(path,root) { return path===root || path.indexOf(root.replace(/\/$/,"")+"/")===0; }
    function transferSources(data) {
        var sources=data.roots.slice(0), parsed=collectionData(data.collections);
        function include(path){if(!path||isDivider(path))return;for(var n=0;n<sources.length;n++)if(underRoot(path,sources[n]))return;var parent=File(path).parent.fsName;if(index(sources,parent)<0)sources.push(parent);}
        for(var i=0;i<data.favorites.length;i++)include(data.favorites[i]);
        for(i=0;i<data.recent.length;i++)include(data.recent[i]);
        for(i=0;i<parsed.length;i++)for(var j=0;j<parsed[i].items.length;j++)include(parsed[i].items[j].path);
        return sources;
    }
    function mappedPath(path,sources,targets) {
        if(!path||isDivider(path))return path;
        var best=-1;
        for(var i=0;i<sources.length;i++)if(underRoot(path,sources[i])&&(best<0||sources[i].length>sources[best].length))best=i;
        return best<0?path:targets[best].replace(/\/$/,"")+path.substring(sources[best].replace(/\/$/,"").length);
    }
    function remapSettings(data,sources,targets) {
        var copy=decodeSettings(encodeSettings(data)), i,j;
        for(i=0;i<copy.roots.length;i++)copy.roots[i]=mappedPath(copy.roots[i],sources,targets);
        for(i=0;i<copy.favorites.length;i++)copy.favorites[i]=mappedPath(copy.favorites[i],sources,targets);
        for(i=0;i<copy.recent.length;i++)copy.recent[i]=mappedPath(copy.recent[i],sources,targets);
        var parsed=collectionData(copy.collections);
        for(i=0;i<parsed.length;i++)for(j=0;j<parsed[i].items.length;j++) {
            var t=parsed[i].items[j];if(isDivider(t.path))continue;
            t.path=mappedPath(t.path,sources,targets);t.root=mappedPath(t.root,sources,targets);
        }
        copy.collections=serializeCollections(parsed);return copy;
    }
    function missingReferences(data) {
        var paths=data.favorites.concat(data.recent), parsed=collectionData(data.collections), missing=[], seen={};
        for(var i=0;i<parsed.length;i++)for(var j=0;j<parsed[i].items.length;j++)paths.push(parsed[i].items[j].path);
        for(i=0;i<paths.length;i++)if(!isDivider(paths[i])&&!seen["$"+paths[i]]) {
            seen["$"+paths[i]]=true;if(!File(paths[i]).exists)missing.push(paths[i]);
        }
        return missing;
    }
    function exportSettings() {
        var file=File.saveDialog("Export Script Manager settings (scripts are not included)","*.smsettings");if(!file)return;
        if(!/\.smsettings$/i.test(file.name))file=File(file.fsName+".smsettings");
        if(file.exists&&!confirm("Replace this settings file?\n"+file.fsName))return;
        writeSettings(file,captureSettings());alert("Settings exported.\n\n"+file.fsName+"\n\nCopy the script files separately to the other computer, keeping their subfolders.");
    }
    function importSettings() {
        var file=File.openDialog("Import Script Manager settings", "*.smsettings");if(!file)return;
        if(file.length>10*1024*1024)throw Error("Settings file is too large.");
        file.encoding="UTF-8";if(!file.open("r"))throw Error("Cannot read settings file.");
        var raw;try{raw=file.read();}finally{file.close();}
        var incoming=decodeSettings(raw), sources=transferSources(incoming), targets=sources.slice(0);
        var dlg=new Window("dialog","Import settings — map script folders");dlg.orientation="column";dlg.alignChildren="fill";
        dlg.add("statictext",undefined,"Select each source folder and choose its corresponding folder on this computer.");
        dlg.add("statictext",undefined,"Keep the same subfolder structure. Script files are not included in the export.");
        var mappings=dlg.add("listbox",undefined,[]);mappings.preferredSize=[650,180];
        var sourceLabel=dlg.add("edittext",undefined,"",{readonly:true});sourceLabel.preferredSize.width=650;
        var targetLabel=dlg.add("edittext",undefined,"",{readonly:true});
        var choose=dlg.add("button",undefined,"Choose local folder…");
        var suggestion=self.parent;
        for(var i=0;i<sources.length;i++) {
            if(!Folder(sources[i]).exists && name(Folder(sources[i]))==="Scripts Panel" && name(suggestion)==="Scripts Panel")targets[i]=suggestion.fsName;
            mappings.add("item",name(Folder(sources[i]))+" → "+targets[i]);
        }
        function showMapping(){var n=mappings.selection?mappings.selection.index:0;sourceLabel.text="From: "+sources[n];targetLabel.text="To: "+targets[n];}
        mappings.onChange=showMapping;mappings.selection=0;showMapping();
        choose.onClick=function(){if(!mappings.selection)return;var n=mappings.selection.index,f=Folder.selectDialog("Choose local folder corresponding to:\n"+sources[n],Folder(targets[n]));if(f){targets[n]=f.fsName;mappings.items[n].text=name(Folder(sources[n]))+" → "+targets[n];showMapping();}};
        var buttons=dlg.add("group");buttons.alignment="right";buttons.add("button",undefined,"Cancel",{name:"cancel"});
        buttons.add("button",undefined,"Continue",{name:"ok"});if(dlg.show()!==1)return;
        var mapped=remapSettings(incoming,sources,targets), missing=missingReferences(mapped), parsed=collectionData(mapped.collections);
        var missingFolders=[];for(i=0;i<mapped.roots.length;i++)if(!Folder(mapped.roots[i]).exists)missingFolders.push(mapped.roots[i]);
        var message="Replace the current Favorites, Collections and folder settings?\n\n"+mapped.favorites.length+" favorite entries (including dividers), "+parsed.length+" collections.\nA backup of the current setup will be saved first.";
        if(missingFolders.length)message+="\n\nMissing script folders:\n"+missingFolders.join("\n");
        if(missing.length)message+="\n\n"+missing.length+" script files are missing. Their references will be kept so you can copy the files later.\n"+missing.slice(0,5).join("\n");
        if(!confirm(message))return;
        var backupDir=Folder(Folder.userData.fsName+"/Script Manager Backups");
        if(!backupDir.exists&&!backupDir.create())throw Error("Cannot create backup folder. Import cancelled.");
        var backup=File(backupDir.fsName+"/Before import "+new Date().getTime()+".smsettings");
        writeSettings(backup,captureSettings());
        var keys=transferKeys.concat(["collectionsData","uiState"]), old=[];
        for(i=0;i<keys.length;i++)old.push(app.extractLabel(KEY+keys[i]));
        try {
            for(i=0;i<transferKeys.length;i++)save(transferKeys[i],mapped[transferKeys[i]]);
            app.insertLabel(KEY+"collectionsData",mapped.collections);app.insertLabel(KEY+"uiState","");
        } catch(e) {for(i=0;i<keys.length;i++)app.insertLabel(KEY+keys[i],old[i]);throw e;}
        roots=mapped.roots;favorites=mapped.favorites;recent=mapped.recent;sortMode=mapped.sort[0];
        collections=parsed;activeCollectionID=mapped.activeCollection[0];collectionsVisible=mapped.collectionsVisible[0]==="true";
        favoriteOrderInitialized=mapped.favoriteManualOrder[0]==="true";selectedCollectionItem=-1;
        restoringUI=true;search.text="";view.selection=0;category.selection=0;
        byName.value=sortMode==="name";byCategory.value=sortMode==="category";
        scan();renderCollection();restoringUI=false;resizeContents();persistUI();
        alert("Settings imported.\n\nBackup of the previous setup:\n"+backup.fsName+(missing.length?"\n\nCopy the missing script files, then click Refresh.":""));
    }
    settingsButton.onClick=function(){
        if(busy)return;
        var d=new Window("dialog","Script Manager settings");d.orientation="column";d.alignChildren="fill";
        var ex=d.add("button",undefined,"Export settings…"),im=d.add("button",undefined,"Import settings…");
        ex.onClick=function(){d.close(1);};im.onClick=function(){d.close(2);};
        var cancel=d.add("button",undefined,"Cancel",{name:"cancel"});cancel.onClick=function(){d.close(0);};
        var choice=d.show();try{if(choice===1)exportSettings();else if(choice===2)importSettings();}catch(e){alert("Settings transfer failed:\n"+e.message);}
    };
    function geometry() {
        if (folding || restoringUI) return;
        if (!collapsed) expandedSize = [win.size.width, win.size.height];
        var size = expandedSize || [820,740];
        save("geometry", [win.location.x, win.location.y, size[0], size[1]]);
        persistUI();
    }
    function setCollapsed(value) {
        value = !!value;
        if (value === collapsed) return;
        folding = true;
        var position = [win.location.x,win.location.y];
        if (value) expandedSize = [win.size.width,win.size.height];
        collapsed = value;
        // Keep the native content container live for edit-field focus.
        library.visible = sidebar.visible = descriptionPanel.visible = !collapsed;
        win.minimumSize = collapsed ? [160,28] : [780,740];
        win.maximumSize = collapsed ? [160,28] : [10000,10000];
        win.margins = collapsed ? 2 : 10;
        foldButton.text = (collapsed ? "+ " : "- ") + "Script Manager";
        foldButton.helpTip = collapsed ? "Expand palette" : "Collapse palette";
        win.size = collapsed ? [160,28] : expandedSize;
        resizeContents();
        if (!collapsed) {
            var size = [win.size.width,win.size.height];
            win.size = [size[0]+1,size[1]]; win.size = size;
            resizeContents();
        }
        win.location = position;
        win.update(); folding = false; geometry();
    }
    foldButton.onClick = function () { setCollapsed(!collapsed); };
    // ScriptUI's automatic column layout may distribute extra height between
    // rows. Give only the list the remaining height; keep every toolbar fixed.
    // Fixed native control heights, never measured from an expanded window.
    var rowHeights = [24, 24, 18, 28, 28, 22, 28];
    function toolbar(group, controls, widths, height, stretch) {
        var gap = 6, available = group.size.width, fixed = gap * (controls.length - 1), i;
        for (i = 0; i < widths.length; i++) if (i !== stretch) fixed += widths[i];
        var x = 0;
        for (i = 0; i < controls.length; i++) {
            var width = i === stretch ? Math.max(20, available - fixed) : widths[i];
            controls[i].bounds = [x, 0, x + width, height]; x += width + gap;
        }
    }
    function resizeContents() {
        if (!rowHeights) return;
        if (collapsed) {
            foldButton.bounds = [2,2,158,26];
            body.bounds = [0,28,0,28];
            return;
        }
        foldButton.bounds = [10,10,166,34];
        var contentHeight = win.size.height - 124;
        var total = win.size.width - 20, side = 330;
        body.bounds = [10, 40, win.size.width - 10, 40 + contentHeight];
        descriptionPanel.bounds = [10, win.size.height-78, win.size.width-10,win.size.height-10];
        descriptionTitle.bounds = [0,0,total,18];
        descriptionText.bounds = [0,22,total,68];
        var libraryWidth = total - side - 10;
        library.bounds = [0, 0, libraryWidth, contentHeight];
        var sidebarHeight=contentHeight;
        sidebar.bounds=[libraryWidth+10,0,total,sidebarHeight];
        collectionPanel.visible=collectionsVisible;
        var favoritesHeight=collectionsVisible ? (sidebarHeight>=780?240:200) : sidebarHeight;
        favoritesPanel.bounds=[0,0,side,favoritesHeight];
        // Fix toolbar heights; extra vertical room belongs only to list boxes.
        // Reserve native panel title/border space below the toolbar as well.
        // Its group also has 4px spare height for macOS button drawing.
        pinnedList.bounds=[10,20,side-10,favoritesHeight-92];
        pinnedDetail.bounds=[10,favoritesHeight-86,side-10,favoritesHeight-68];
        pinnedActions.bounds=[10,favoritesHeight-62,side-10,favoritesHeight-30];toolbar(pinnedActions,[pinnedRun,pinnedUp,pinnedDown,pinnedRemove,pinnedDivider],[54,28,28,86,72],28,-1);
        if(collectionsVisible){
            var ch=sidebarHeight-favoritesHeight-10;
            collectionPanel.bounds=[0,favoritesHeight+10,side,sidebarHeight];
            var cy=20, cw=side-20;
            function collectionRow(control,height){control.bounds=[10,cy,10+cw,cy+height];cy+=height+6;}
            collectionRow(collectionHeader,28);collectionRow(collectionNote,44);
            // 294px for fixed controls/gaps; keep 30px clear below the last button.
            collectionRow(collectionList,Math.max(80,ch-294-30));
            collectionRow(groupRow,28);collectionRow(collectionActions,28);
            collectionRow(entryLabel,18);collectionRow(entryNote,58);
            collectionRow(locateEntry,28);
            toolbar(collectionHeader,[collectionPicker,openCollection,manageCollections],[120,80,96],28,0);
            toolbar(groupRow,[groupPicker,groupManage],[200,96],28,0);
            toolbar(collectionActions,[collectionRun,moveUp,moveDown,removeEntry,collectionDivider],[54,28,28,86,72],28,-1);
        }
        var width = libraryWidth, y = 0, gap = 6;
        function row(control, height) {
            control.bounds = [0, y, width, y + height];
            y += height + gap;

        }
        row(searchRow, rowHeights[0]);
        toolbar(searchRow, [search, clearSearch], [376, 28], rowHeights[0], 0);
        row(filters, rowHeights[1]);
        var remaining = contentHeight - 7 * gap;
        for (var i = 0; i < rowHeights.length; i++) remaining -= rowHeights[i];
        row(list, Math.max(100, remaining));
        row(detail, rowHeights[2]);
        row(actions, rowHeights[3]);
        row(footer, rowHeights[4]);
        row(sorting, rowHeights[5]);
        row(quickViews, rowHeights[6]);
        toolbar(filters,[view,category],[112,200],24,1);
        toolbar(actions,[run,star,reveal,addToCollection],[60,100,105,64],28,-1);
        toolbar(footer,[folders,refresh,collectionsToggle,settingsButton,status],[72,70,88,82,70],28,4);
        toolbar(sorting,[sorting.children[0],byName,byCategory],[30,65,90],22,-1);
        toolbar(quickViews,[allViewButton,favoriteViewButton,recentViewButton],[106,106,90],28,-1);
    }
    win.onResizing = resizeContents;
    win.onResize = function () { resizeContents(); geometry(); };
    win.onMove = geometry;
    win.onClose = function () { geometry(); G.thScriptManager = null; };
    scan(); renderCollection();
    if (savedUI.length >= 7) {
        var savedView = Number(savedUI[1]); view.selection = savedView >= 0 && savedView <= 2 ? savedView : 0;
        for (var ui = 0; ui < category.items.length; ui++) if (category.items[ui].text === savedUI[2]) category.selection = ui;
        search.text = savedUI[0];
        render(savedUI[3]);
        for (ui = 0; ui < pinnedList.items.length; ui++) if (pinnedList.items[ui].record.path === savedUI[4]) pinnedList.selection = ui;
        var savedEntry = Number(savedUI[5]), savedCollection = currentCollection();
        selectedCollectionItem = savedCollection && savedEntry >= 0 && savedEntry < savedCollection.items.length ? savedEntry : -1;
        renderCollection();
        updatingCollections = true;
        for (ui = 0; ui < groupPicker.items.length; ui++) if (groupPicker.items[ui].text === savedUI[6]) groupPicker.selection = ui;
        updatingCollections = false;
        selectionChanged();
    }
    win.layout.layout(true);
    // Own the window layout after construction. Native layout must not stretch
    // groups or their buttons again during show, resize, or visibility changes.
    win.layout = { layout: function () { resizeContents(); }, resize: function () { resizeContents(); } };
    win.onShow = function () { resizeContents(); };
    var minimumHeight = 20 + 42 + 100;
    for (var rh = 0; rh < rowHeights.length; rh++) minimumHeight += rowHeights[rh];
    win.minimumSize = [780, Math.max(minimumHeight, 740)];
    var bounds = read("geometry"), restored = false;
    if (bounds.length === 4) {
        var x = Number(bounds[0]), y = Number(bounds[1]), w = Number(bounds[2]), h = Number(bounds[3]);
        if (isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h) && w >= 350 && h >= 275) {
            for (var s = 0; s < $.screens.length; s++) {
                var screen = $.screens[s];
                if (x >= screen.left && y >= screen.top && x + 100 < screen.right && y + 60 < screen.bottom) {
                    win.size = [Math.min(w, screen.right - screen.left), Math.min(h, screen.bottom - screen.top)]; win.location = [x, y]; restored = true; break;
                }
            }
        }
    }
    if (win.size.width < 780 || win.size.height < 740) win.size = [Math.max(820,win.size.width), Math.max(740,win.size.height)];
    if (!restored) win.center();
    resizeContents();
    G.thScriptManager = {window: win, version: "1.7.0"};
    win.show(); resizeContents();
    expandedSize = [win.size.width, win.size.height];
    var restoreCollapsed = read("collapsed")[0] === "true";
    restoringUI = false;
    if (restoreCollapsed) setCollapsed(true); else search.active = true;
    geometry();
})();
