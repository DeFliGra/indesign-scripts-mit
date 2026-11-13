//DESCRIPTION:Font Collector v.1.0.1 - Collect Used Fonts — friendly dialog edition (English)

/*
  - Finds all fonts used in the active document
  - Copies the corresponding font files to a chosen folder (default: ~/Desktop/Used Fonts)
  - Can create an automatic subfolder with document name + timestamp
  - Shows a report and offers to open the folder afterwards
/*

/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided "as is", without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/

(function () {
    var scriptName = "Collect used fonts — current document";
    var doc;

    preCheck();
    var ui = showDialog();
    if (!ui) return; // Cancel
    var destFolder = ui.destFolder;
    var useDocSubfolder = ui.useDocSubfolder;
    var useTimestamp = ui.useTimestamp;

    // Build final destination folder
    var finalDest = buildDestinationFolder(destFolder, useDocSubfolder ? safeName(doc.name) : null, useTimestamp);
    if (!finalDest.exists) finalDest.create();

    var result = collectFonts(finalDest);

    // Report
    var lines = [];
    if (result.copied === 0 && result.existing === 0 && result.missing.length === 0) {
        lines.push("No fonts were copied.");
    } else {
        if (result.copied === 1) lines.push("1 font was copied.");
        else if (result.copied > 1) lines.push(result.copied + " fonts were copied.");
        if (result.existing > 0) lines.push(result.existing + " already existed and were not overwritten.");
        if (result.failed > 0) lines.push(result.failed + " could not be copied (unknown error).");
        if (result.missing.length > 0) {
            lines.push("");
            lines.push("The following fonts could not be copied (no local font file — often Adobe Fonts/Typekit):");
            for (var i = 0; i < result.missing.length; i++) {
                lines.push("• " + result.missing[i]);
            }
        }
    }
    lines.push("");
    lines.push("Destination:");
    lines.push(finalDest.fsName);

    var openNow = confirm(lines.join("\n") + "\n\nOpen the folder now?", false, scriptName);
    if (openNow) finalDest.execute();

    // =============== Functions ===============
    function preCheck() {
        if (app.documents.length === 0) errorExit("Please open a document and try again.", true);
        doc = app.activeDocument;
        if (doc.converted) errorExit("The current document was converted from an older InDesign version. Please save and try again.", true);
        if (!doc.saved) errorExit("The current document has not been saved yet. Please save and try again.", true);
    }

function showDialog() {
    var dlg = new Window("dialog", "Collect Used Fonts");
    dlg.alignChildren = "fill";

    // Info
    var infoGrp = dlg.add("group");
    infoGrp.orientation = "column";
    infoGrp.alignChildren = "left";
    infoGrp.add("statictext", undefined, "This script copies the fonts used in the active document,");
    infoGrp.add("statictext", undefined, "into a folder named 'Document Fonts' next to the InDesign file.");
    infoGrp.add("statictext", undefined, "Note: Respect font licenses — copy only fonts you are allowed to distribute.");

    // Destination
    var destPanel = dlg.add("panel", undefined, "Destination");
    destPanel.orientation = "row";
    destPanel.alignChildren = ["fill", "center"];

    // Default: same folder as document
    var defaultBase = Folder(doc.filePath + "/Document Fonts");
    var destField = destPanel.add("edittext", undefined, defaultBase.fsName);
    destField.characters = 45;
    var chooseBtn = destPanel.add("button", undefined, "Choose…");

    chooseBtn.onClick = function () {
        var picked = Folder.selectDialog("Choose a folder for fonts", defaultBase);
        if (picked) destField.text = picked.fsName;
    };

    // Buttons
    var btns = dlg.add("group");
    btns.alignment = "right";
    var cancelBtn = btns.add("button", undefined, "Cancel", { name: "cancel" });
    var okBtn = btns.add("button", undefined, "Copy fonts", { name: "ok" });

    cancelBtn.onClick = function () { dlg.close(0); };
    okBtn.onClick = function () {
        var f = new Folder(destField.text);
        if (!f.exists) {
            try { f.create(); } catch (e) {}
        }
        if (!f.exists) {
            alert("Cannot use the chosen destination:\n" + destField.text, scriptName);
            return;
        }
        dlg.close(1);
    };

    var ok = dlg.show();
    if (ok !== 1) return null;

    return {
        destFolder: new Folder(destField.text),
        useDocSubfolder: false,
        useTimestamp: false
    };
}


    function buildDestinationFolder(baseFolder, docNameOrNull, addTimestamp) {
        var base = new Folder(baseFolder.fsName);
        if (!base.exists) base.create();

        var pathParts = [base.fsName];
        if (docNameOrNull) pathParts.push(docNameOrNull.replace(/\.[^\.]+$/, "")); // strip extension
        if (addTimestamp) pathParts.push(timeStamp());

        return new Folder(pathParts.join("/"));
    }

    function timeStamp() {
        var d = new Date();
        function pad(n) { return (n < 10 ? "0" + n : "" + n); }
        return d.getFullYear().toString() +
            pad(d.getMonth() + 1) +
            pad(d.getDate()) + "-" +
            pad(d.getHours()) +
            pad(d.getMinutes()) +
            pad(d.getSeconds());
    }

    function safeName(s) {
        return String(s).replace(/[\\\/:\*\?"<>\|]/g, "_").replace(/\s+$/, "");
    }

    function collectFonts(targetFolder) {
        var out = { copied: 0, existing: 0, failed: 0, missing: [] };

        var fonts = doc.fonts.everyItem().getElements();
        for (var i = 0; i < fonts.length; i++) {
            var fnt = fonts[i];
            var loc;
            try {
                loc = fnt.location;
            } catch (err) {
                out.missing.push(fnt.postscriptName || fnt.name || "Unknown font");
                continue;
            }
            if (!loc) {
                out.missing.push(fnt.postscriptName || fnt.name || "Unknown font");
                continue;
            }

            var src = new File(loc);
            if (!src.exists) {
                out.missing.push(fnt.postscriptName || fnt.name || src.fsName);
                continue;
            }

            var dst = new File(targetFolder.fsName + "/" + src.name);
            if (dst.exists) {
                out.existing++;
                continue; // do not overwrite
            }

            try {
                var ok = src.copy(dst);
                if (ok) out.copied++;
                else out.failed++;
            } catch (e) {
                out.failed++;
            }
        }
        return out;
    }

    function errorExit(msg, icon) {
        alert(msg, scriptName, icon);
        exit();
    }
})();