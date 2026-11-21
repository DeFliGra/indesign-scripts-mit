//DESCRIPTION:SwatchSwap v1.0.0 - Copies color settings from one swatch to another while keeping the target swatch’s name.

/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided "as is", without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/

#target "indesign"

(function () {
    if (app.documents.length === 0) {
        alert("Open an InDesign document first.");
        return;
    }

    var doc = app.activeDocument;
    var colors = doc.colors.everyItem().getElements();

    var excludedNames = ["None", "Registration", "Paper", "Black", "Cyan", "Magenta", "Yellow"];
    var eligibleColors = [];

    for (var i = 0; i < colors.length; i++) {
        var color = colors[i];
        if (!color.isValid) continue;
        var name = color.name;
        var excluded = false;
        for (var j = 0; j < excludedNames.length; j++) {
            if (name === excludedNames[j]) {
                excluded = true;
                break;
            }
        }
        if (excluded) continue;
        eligibleColors.push(color);
    }

    if (eligibleColors.length < 2) {
        alert("There are not enough eligible color swatches.");
        return;
    }

    function swatchID(item, property) {
        try {
            var swatch = item[property];
            return swatch.isValid ? swatch.id : null;
        } catch (error) {
            return null;
        }
    }

    var selectedFillID = app.selection.length === 1
        ? swatchID(app.selection[0], "fillColor") : null;
    var layout = app.layoutWindows.length ? app.activeWindow : null;
    var page = layout ? layout.activePage : null;
    var usedIDs = {};
    if (page && page.isValid) {
        var items = page.allPageItems;
        for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
            usedIDs[swatchID(items[itemIndex], "fillColor")] = true;
            usedIDs[swatchID(items[itemIndex], "strokeColor")] = true;
        }
    }

    function previewRGB(color) {
        var values = color.colorValue;
        if (color.space === ColorSpace.RGB) {
            return [values[0] / 255, values[1] / 255, values[2] / 255, 1];
        }
        if (color.space === ColorSpace.CMYK) {
            var light = 1 - values[3] / 100;
            return [
                (1 - values[0] / 100) * light,
                (1 - values[1] / 100) * light,
                (1 - values[2] / 100) * light,
                1
            ];
        }
        return null;
    }

    // Indexed PNG with a gray border and a replaceable fill palette entry.
    var previewHeader = "\x89\x50\x4e\x47\x0d\x0a\x1a\x0a\x00\x00\x00\x0d\x49\x48\x44\x52\x00\x00\x00\x0c\x00\x00\x00\x0c\x08\x03\x00\x00\x00\x61\xab\xac\xd5";
    var previewTail = "\x00\x00\x00\x12\x49\x44\x41\x54\x78\x9c\x63\x60\x40\x01\x8c\x70\x30\x50\x1c\x24\x00\x00\x1f\x14\x00\x65\x5a\xe8\xd9\xda\x00\x00\x00\x00\x49\x45\x4e\x44\xae\x42\x60\x82";

    function paletteCRC(data) {
        var crc = -1;
        for (var i = 0; i < data.length; i++) {
            crc ^= data.charCodeAt(i);
            for (var bit = 0; bit < 8; bit++) {
                crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
            }
        }
        crc ^= -1;
        return String.fromCharCode(crc >>> 24, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255);
    }

    var iconsByColorID = {};

    function addSwatchRow(list, swatch) {
        var row = list.add("item", swatch.name);
        var icon = iconsByColorID[swatch.id];
        if (icon === undefined) {
            var rgb = previewRGB(swatch);
            icon = null;
            if (rgb) {
                var palette = "PLTE" + String.fromCharCode(128, 128, 128,
                    Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255));
                var paletteLength = String.fromCharCode(0, 0, 0, 6);
                icon = ScriptUI.newImage(previewHeader + paletteLength + palette + paletteCRC(palette) + previewTail);
            }
            iconsByColorID[swatch.id] = icon;
        }
        if (icon) row.image = icon;
    }

    var w = new Window("dialog", "SwatchSwap");
    w.orientation = "column";
    w.alignChildren = "fill";

    var swatchLists = w.add("group");
    swatchLists.orientation = "row";
    swatchLists.alignChildren = ["fill", "top"];

    var sourceColumn = swatchLists.add("group");
    sourceColumn.orientation = "column";
    sourceColumn.alignChildren = "fill";
    sourceColumn.add("statictext", undefined, "Copy from");
    var sourceDD = sourceColumn.add("listbox");
    sourceDD.preferredSize = [250, 280];
    for (var sourceIndex = 0; sourceIndex < eligibleColors.length; sourceIndex++) {
        addSwatchRow(sourceDD, eligibleColors[sourceIndex]);
    }
    sourceDD.selection = 0;

    var targetColumn = swatchLists.add("group");
    targetColumn.orientation = "column";
    targetColumn.alignChildren = "fill";
    targetColumn.add("statictext", undefined, "Copy to");
    var targetDD = targetColumn.add("listbox");
    targetDD.preferredSize = [250, 280];

    var pageFilter = w.add("checkbox", undefined, "Only show object fill and stroke swatches on the active page in Copy to");
    pageFilter.enabled = !!(page && page.isValid);
    var targetColors = [];
    var noPageColors = w.add("statictext", undefined, "No eligible object fill or stroke swatches found on this page.");
    noPageColors.hide();

    var info = w.add("statictext", undefined,
        "Select one object before opening SwatchSwap to preselect its fill under Copy to.\n" +
        "This change affects all objects and styles that use the swatch selected under Copy to.",
        {multiline: true}
    );
    info.preferredSize.width = 500;

    var buttons = w.add("group");
    buttons.alignment = "right";
    buttons.add("button", undefined, "Cancel", {name: "cancel"});
    var copyButton = buttons.add("button", undefined, "Copy Color", {name: "ok"});

    function refreshTarget(preferredID) {
        targetDD.removeAll();
        targetColors = [];
        var selectedIndex = 0;
        for (var index = 0; index < eligibleColors.length; index++) {
            var swatch = eligibleColors[index];
            if (pageFilter.value && !usedIDs[swatch.id]) continue;
            if (swatch.id === preferredID) selectedIndex = targetColors.length;
            targetColors.push(swatch);
            addSwatchRow(targetDD, swatch);
        }
        if (targetColors.length) targetDD.selection = selectedIndex;
        copyButton.enabled = targetColors.length > 0;
        noPageColors.visible = !targetColors.length;
    }

    pageFilter.onClick = function () {
        var current = targetDD.selection ? targetColors[targetDD.selection.index] : null;
        refreshTarget(current ? current.id : selectedFillID);
    };
    refreshTarget(selectedFillID);

    if (w.show() !== 1 || !targetDD.selection || !sourceDD.selection) return;

    var target = targetColors[targetDD.selection.index];
    var source = eligibleColors[sourceDD.selection.index];

    if (target.name === source.name) {
        alert("Select different source and target swatches.");
        return;
    }

    app.doScript(function () {
        target.model = source.model;
        target.space = source.space;
        target.colorValue = source.colorValue;
    }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, "Copy Swatch Color");

})();
