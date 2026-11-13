//DESCRIPTION:Link Collector v.1.0.0 - Collect Used Links next to document

/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided "as is", without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/

(function () {
    var scriptName = "Collect used links — current document";
    var doc;

    preCheck();

    var destFolder = Folder(doc.filePath + "/Links");
    if (!destFolder.exists) destFolder.create();

    var result = collectLinks(destFolder);

    var lines = [];

    lines.push(result.copied + " link(s) copied.");
    if (result.existing > 0) lines.push(result.existing + " already existed and were skipped.");
    if (result.failed > 0) lines.push(result.failed + " could not be copied.");
    if (result.missing.length > 0) {
        lines.push("");
        lines.push("Missing / unavailable links:");
        for (var i = 0; i < result.missing.length; i++) {
            lines.push("• " + result.missing[i]);
        }
    }

    lines.push("");
    lines.push("Destination:");
    lines.push(destFolder.fsName);

    if (confirm(lines.join("\n") + "\n\nOpen the folder now?", false, scriptName)) {
        destFolder.execute();
    }

    // ================= Functions =================

    function preCheck() {
        if (app.documents.length === 0) errorExit("Please open a document and try again.");
        doc = app.activeDocument;
        if (!doc.saved) errorExit("The current document has not been saved yet. Please save and try again.");
    }

    function collectLinks(targetFolder) {
        var out = {
            copied: 0,
            existing: 0,
            failed: 0,
            missing: []
        };

        var links = doc.links.everyItem().getElements();
        var copiedSources = {};

        for (var i = 0; i < links.length; i++) {
            var lnk = links[i];

            var path;
            try {
                path = lnk.filePath;
            } catch (e) {
                out.missing.push(lnk.name);
                continue;
            }

            if (!path) {
                out.missing.push(lnk.name);
                continue;
            }

            var src = new File(path);

            if (!src.exists) {
                out.missing.push(lnk.name);
                continue;
            }

            // Avoid copying same source more than once
            if (copiedSources[src.fsName]) {
                continue;
            }
            copiedSources[src.fsName] = true;

            var dst = new File(targetFolder.fsName + "/" + src.name);

            if (dst.exists) {
                out.existing++;
                continue;
            }

            try {
                if (src.copy(dst)) {
                    out.copied++;
                } else {
                    out.failed++;
                }
            } catch (err) {
                out.failed++;
            }
        }

        return out;
    }

    function errorExit(msg) {
        alert(msg, scriptName);
        exit();
    }

})();