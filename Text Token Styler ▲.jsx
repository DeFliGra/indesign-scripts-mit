//DESCRIPTION: Token Styler v.1.1.0 — Token Styler automates text formatting in Adobe InDesign by applying paragraph and character styles through customizable token sequences.

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
#targetengine "TokenStylerPalette"

(function () {

    // Genbrug eksisterende palette i samme engine (undgå flere vinduer)
    if ($.global.__tokenStylerWin && $.global.__tokenStylerWin instanceof Window) {
        try { $.global.__tokenStylerWin.show(); $.global.__tokenStylerWin.active = true; return; } catch(_) {}
    }

    function ensureDoc() {
        if (app.documents.length === 0) throw new Error("Open a document first.");
        return app.activeDocument;
    }

    function trimES(v) {
        return (v == null ? "" : (v + "").replace(/^[\s\uFEFF\xA0\r\n]+|[\s\uFEFF\xA0\r\n]+$/g, ""));
    }

    function getLabel(doc, key, fallback) {
        var v = doc.extractLabel(key);
        return v !== "" ? v : (fallback || "");
    }

    function getBool(doc, key, defTrueIfEmpty) {
        var v = doc.extractLabel(key);
        if (v === "") return !!defTrueIfEmpty;
        return v === "true";
    }

    // ==== UI ====
    var w = new Window("palette", "Token Styler");
    $.global.__tokenStylerWin = w;

    w.orientation = "column";
    w.alignChildren = "fill";
    w.margins = 10;
    w.spacing = 6;

    // Header + collapse
    var header = w.add("group");
    header.orientation = "row";
    header.alignChildren = ["left","center"];
    header.spacing = 6;

    var collapseBtn = header.add("button", undefined, "▾");
    collapseBtn.preferredSize = [28, 22];

    var title = header.add("statictext", undefined, "Token Styler · www.takeiteasy.dk");
    title.alignment = ["fill","center"];

    var guideBtn = header.add("button", undefined, "Guide…");
    guideBtn.preferredSize = [72, 22];
    guideBtn.onClick = function () { showGuide(); };

    // Body (foldbar)
    var body = w.add("group");
    body.orientation = "column";
    body.alignChildren = "fill";
    body.spacing = 10;

    function addDivider(parent){
        var p = parent.add("panel");
        p.minimumSize.height = 2;
        p.maximumSize.height = 2;
        p.alignment = "fill";
        return p;
    }

    function showGuide() {
        var guide = new Window("dialog", "Token Styler · Guide");
        guide.orientation = "column";
        guide.alignChildren = "fill";
        guide.margins = 14;
        guide.spacing = 10;

        // Brug rigtige UI-kolonner i stedet for mellemrum. Multiline edittext
        // respekterer ikke altid en valgt font i nyere macOS/InDesign-versioner.
        var guideContent = guide.add("panel");
        guideContent.orientation = "column";
        guideContent.alignChildren = "fill";
        guideContent.margins = 12;
        guideContent.spacing = 7;
        guideContent.preferredSize = [600, 425];

        function addGuideLine(parent, value) {
            var line = parent.add("statictext", undefined, value);
            line.alignment = "fill";
            return line;
        }

        function addGuideBlock(parent, value, height) {
            var block = parent.add("statictext", undefined, value, {multiline:true});
            block.alignment = "fill";
            block.preferredSize.height = height;
            return block;
        }

        function addGuideRow(parent, syntax, explanation) {
            var row = parent.add("group");
            row.orientation = "row";
            row.alignChildren = ["left", "center"];
            row.spacing = 10;
            row.alignment = "fill";

            var syntaxText = row.add("statictext", undefined, syntax);
            syntaxText.minimumSize.width = 145;
            syntaxText.maximumSize.width = 145;

            var explanationText = row.add("statictext", undefined, explanation);
            explanationText.alignment = ["fill", "center"];
        }

        addGuideLine(guideContent, "COMBINING STYLES");
        addGuideBlock(guideContent,
            "A token is the beginning of a style name:\r" +
            "A4 matches, for example, paragraph style: A4 Body\r" +
            "T3 matches, for example, character style: T3 Time blue", 50);
        addGuideBlock(guideContent,
            "Apply a paragraph style and a character style to the same paragraph using +\r" +
            "A4+T3\r" +
            "Important: Do not add spaces around +.", 50);

        addGuideLine(guideContent, "SERIES AND SPECIAL CHARACTERS");
        var seriesRows = guideContent.add("group");
        seriesRows.orientation = "column";
        seriesRows.alignChildren = "fill";
        seriesRows.spacing = 2;
        seriesRows.alignment = "fill";

        addGuideRow(seriesRows, "A1,A2,A3",      "Use the next token for each new paragraph");
        addGuideRow(seriesRows, "A3,LAST:A9",    "A3 for paragraphs; A9 for the last one");
        addGuideRow(seriesRows, "A3,PRELAST:A8", "A8 for the second-to-last paragraph");
        addGuideRow(seriesRows, "B1/A3",         "B1 for headings; A3 for body text");
        addGuideRow(seriesRows, "B1+T2/A3+T3",   "Conditional choice using both style types");
        addGuideRow(seriesRows, "[A1,A2,A3]",    "Repeat the series in a loop");
        addGuideRow(seriesRows, "A1,A2,A3//",    "Same loop, alternative syntax");

        addGuideLine(guideContent, "REMEMBER");
        addGuideBlock(guideContent,
            "A comma (,) means the next paragraph.\r" +
            "A plus sign (+) combines styles on the same paragraph.\r" +
            "A slash (/) selects between heading and body text styles; it does not combine them.\r" +
            "LAST: and PRELAST: override the last/second-to-last non-empty paragraph.", 66);

        var guideFooter = guide.add("group");
        guideFooter.alignment = "right";
        var guideClose = guideFooter.add("button", undefined, "Close", {name:"ok"});
        guideClose.preferredSize = [80, 26];

        guide.center();
        guide.show();
    }

    // ---- Load last values (fra doc labels) ----
    var doc;
    try { doc = ensureDoc(); } catch(e) { alert(e.message); return; }

    var maxHeadingWords = parseInt(getLabel(doc, "HeadingMaxWords", "18"), 10);
    if (isNaN(maxHeadingWords) || maxHeadingWords < 1) maxHeadingWords = 18;

    var allowQuestionHeading = getBool(doc, "AllowQuestionHeading", false);

    var last = [];
    last[1]  = getLabel(doc, "LetterSeries1",  getLabel(doc, "LetterSeries", "A1,B1/A3"));
    last[2]  = getLabel(doc, "LetterSeries2",  "A1,B1/A3,LAST:A5");
    for (var i=3;i<=20;i++) last[i] = getLabel(doc, "LetterSeries"+i, "");

    var lastRun = parseInt(getLabel(doc, "LastRunSeries", "1"), 10);
    if (isNaN(lastRun) || lastRun < 1 || lastRun > 20) lastRun = 1;

    var resetEmpty        = getBool(doc, "ResetOnEmptyPara", true);
    var resetBullets      = getBool(doc, "ResetOnBullets", false);
    var resetPerFrame     = getBool(doc, "ResetPerFrame", true);
    var runSelectionOnly  = getBool(doc, "RunOnSelectionOnly", false);
    var storedBulletToken = getLabel(doc, "BulletToken", "");

    // ---- UI helpers ----
    function addSeriesRow(parent, label, value){
        var g = parent.add("group");
        g.orientation = "row";
        g.alignChildren = ["left","center"];
        g.spacing = 6;
        g.alignment = "fill";

        g.add("statictext", undefined, label);

        var edit = g.add("edittext", undefined, value);
        edit.characters = 24;
        edit.alignment = "fill";
        return edit;
    }

    // =========================
    // 1) Serie felter øverst
    // =========================
    var seriesMain = body.add("group");
    seriesMain.orientation = "row";
    seriesMain.alignChildren = ["fill","top"];
    seriesMain.spacing = 10;
    seriesMain.alignment = "fill";

    var col1 = seriesMain.add("group"); col1.orientation="column"; col1.alignChildren=["fill","top"]; col1.alignment="fill";
    var col2 = seriesMain.add("group"); col2.orientation="column"; col2.alignChildren=["fill","top"]; col2.alignment="fill";
    var col3 = seriesMain.add("group"); col3.orientation="column"; col3.alignChildren=["fill","top"]; col3.alignment="fill";
    var col4 = seriesMain.add("group"); col4.orientation="column"; col4.alignChildren=["fill","top"]; col4.alignment="fill";

    var inputs = [];
    inputs[1]  = addSeriesRow(col1, "Series  1:",  last[1]);
    inputs[2]  = addSeriesRow(col1, "Series  2:",  last[2]);
    inputs[3]  = addSeriesRow(col1, "Series  3:",  last[3]);
    inputs[4]  = addSeriesRow(col1, "Series  4:",  last[4]);
    inputs[5]  = addSeriesRow(col1, "Series  5:",  last[5]);

    inputs[6]  = addSeriesRow(col2, "Series  6:",  last[6]);
    inputs[7]  = addSeriesRow(col2, "Series  7:",  last[7]);
    inputs[8]  = addSeriesRow(col2, "Series  8:",  last[8]);
    inputs[9]  = addSeriesRow(col2, "Series  9:",  last[9]);
    inputs[10] = addSeriesRow(col2, "Series 10:", last[10]);

    inputs[11] = addSeriesRow(col3, "Series 11:", last[11]);
    inputs[12] = addSeriesRow(col3, "Series 12:", last[12]);
    inputs[13] = addSeriesRow(col3, "Series 13:", last[13]);
    inputs[14] = addSeriesRow(col3, "Series 14:", last[14]);
    inputs[15] = addSeriesRow(col3, "Series 15:", last[15]);

    inputs[16] = addSeriesRow(col4, "Series 16:", last[16]);
    inputs[17] = addSeriesRow(col4, "Series 17:", last[17]);
    inputs[18] = addSeriesRow(col4, "Series 18:", last[18]);
    inputs[19] = addSeriesRow(col4, "Series 19:", last[19]);
    inputs[20] = addSeriesRow(col4, "Series 20:", last[20]);

    addDivider(body);

    // =========================
    // 2) Options område (2 spalter)
    // =========================
    var opts = body.add("group");
    opts.orientation = "row";
    opts.alignChildren = ["fill","top"];
    opts.spacing = 20;
    opts.alignment = "fill";

    var optL = opts.add("group"); optL.orientation="column"; optL.alignChildren=["left","center"]; optL.alignment="fill"; optL.spacing=6;
    var optR = opts.add("group"); optR.orientation="column"; optR.alignChildren=["left","center"]; optR.alignment="fill"; optR.spacing=6;

    // Row: Max words
    var headingL = optL.add("group");
    headingL.orientation = "row";
    headingL.alignChildren = ["left","center"];
    headingL.spacing = 8;

    headingL.add("statictext", undefined, "Max. words in heading/subheading:");
    var headingMaxWordsEdit = headingL.add("edittext", undefined, String(maxHeadingWords));
    headingMaxWordsEdit.characters = 3;

    // Question heading
    var cbQuestionHeading = optR.add("checkbox", undefined, "Short sentences ending in ? = subheadings");
    cbQuestionHeading.value = allowQuestionHeading;

    // Reset ved tomt afsnit / Reset per frame
    var cbEmpty = optL.add("checkbox", undefined, "Reset at empty paragraphs (double return)");
    cbEmpty.value = resetEmpty;

    var cbResetPerFrame = optR.add("checkbox", undefined, "Reset series for each selected text frame");
    cbResetPerFrame.value = resetPerFrame;

    // Bullets + token
    var bulletBlock = optL.add("group");
    bulletBlock.orientation = "column";
    bulletBlock.alignChildren = ["left","center"];
    bulletBlock.spacing = 4;

    var cbBullets = bulletBlock.add("checkbox", undefined, "Reset at bullet points (•, °, …)");
    cbBullets.value = resetBullets;

    var cbDashBullets = bulletBlock.add("checkbox", undefined, "Also treat -, – and — as bullet points");
    cbDashBullets.value = getBool(doc, "TreatDashesAsBullets", false);
    cbDashBullets.helpTip = "Leave unchecked when headings start with a dash. Also applies to automatic heading detection.";

    var bulletTokenGrp = bulletBlock.add("group");
    bulletTokenGrp.orientation = "row";
    bulletTokenGrp.alignChildren = ["left","center"];
    bulletTokenGrp.spacing = 6;

    bulletTokenGrp.add("statictext", undefined, "Bullet token (e.g. P1):");
    var bulletEdit = bulletTokenGrp.add("edittext", undefined, storedBulletToken);
    bulletEdit.characters = 8;

    bulletTokenGrp.enabled = cbBullets.value;
    cbBullets.onClick = function () { bulletTokenGrp.enabled = cbBullets.value; };

    // Kør kun på markeret tekst (egen række)
    var cbSelectionOnly = body.add("checkbox", undefined, "Run on selected text only");
    cbSelectionOnly.value = runSelectionOnly;

    // Sidst brugt
    var lastRow = body.add("group");
    lastRow.orientation = "row";
    lastRow.alignChildren = ["left","center"];
    lastRow.spacing = 10;

    var lastNote = lastRow.add("statictext", undefined, "Last used: Series " + lastRun);

    addDivider(body);

    // =========================
    // 3) Run buttons (4 kolonner, matcher serie-kolonner og fylder bredden)
    // =========================
    var btnWrap = body.add("group");
    btnWrap.orientation = "row";
    btnWrap.alignChildren = ["fill","top"];
    btnWrap.spacing = 10;
    btnWrap.alignment = "fill";

    function addRunColumn(parent) {
        var g = parent.add("group");
        g.orientation = "column";
        g.alignChildren = ["fill","top"];
        g.spacing = 6;
        g.alignment = "fill";
        return g;
    }

    var btnCol1 = addRunColumn(btnWrap);
    var btnCol2 = addRunColumn(btnWrap);
    var btnCol3 = addRunColumn(btnWrap);
    var btnCol4 = addRunColumn(btnWrap);

    function clearChildren(g){
        try { while (g.children.length) g.remove(g.children[0]); } catch(_) {}
    }

    function addRunButton(colGroup, n) {
        var b = colGroup.add("button", undefined, "Run " + n);
        b.alignment = "fill";
        b.minimumSize.height = 26;
        b.onClick = function () {
            try { runTokenStyler(n); }
            catch (e) { alert(e.message); }
        };
        return b;
    }

    function buildRunButtons() {
        clearChildren(btnCol1);
        clearChildren(btnCol2);
        clearChildren(btnCol3);
        clearChildren(btnCol4);

        for (var n1=1;n1<=5;n1++)   addRunButton(btnCol1, n1);
        for (var n2=6;n2<=10;n2++)  addRunButton(btnCol2, n2);
        for (var n3=11;n3<=15;n3++) addRunButton(btnCol3, n3);
        for (var n4=16;n4<=20;n4++) addRunButton(btnCol4, n4);
    }

    function syncRunButtonWidths() {
        try {
            var cols = [col1, col2, col3, col4];
            var btnCols = [btnCol1, btnCol2, btnCol3, btnCol4];

            for (var c = 0; c < cols.length; c++) {
                var cw = cols[c].size.width;
                if (!cw || cw < 50) cw = cols[c].preferredSize.width || 220;

                btnCols[c].minimumSize.width = cw;
                btnCols[c].maximumSize.width = cw;

                for (var b = 0; b < btnCols[c].children.length; b++) {
                    btnCols[c].children[b].preferredSize.width = cw;
                    btnCols[c].children[b].maximumSize.width   = cw;
                }
            }
        } catch(_) {}
    }

    buildRunButtons();

    // =========================
    // 4) Footer nederst: Luk
    // =========================
    var foot = body.add("group");
    foot.orientation = "row";
    foot.alignChildren = ["right","center"];
    foot.alignment = "right";
    foot.spacing = 8;

    var btnCleanParagraphs = foot.add("button", undefined, "Remove Empty Paragraphs");
    btnCleanParagraphs.helpTip = "Collapse repeated paragraph breaks in selected text. Preserves manual line breaks (Shift+Return).";
    btnCleanParagraphs.onClick = function () {
        try { removeRepeatedParagraphBreaks(); }
        catch (e) { alert(e.message); }
    };

    function removeRepeatedParagraphBreaks() {
        ensureDoc();
        if (app.selection.length !== 1) {
            alert("Select the text you want to clean first.");
            return;
        }
        var selected = app.selection[0];
        var kind = selected.constructor ? selected.constructor.name : "";
        if (!/^(Text|TextStyleRange|Paragraph|Line|Word|Character)$/.test(kind) ||
            !selected.characters || selected.characters.length < 1) {
            alert("Select a range of text first. A text frame or insertion point is not enough.");
            return;
        }

        // Use character indices rather than string offsets to handle special characters.
        var chars = selected.characters;
        var story = selected.parentStory;
        var start = chars[0].index;
        var ranges = [];
        var afterBreak = -1;
        var lastBreak = -1;
        for (var i = 0; i < chars.length; i++) {
            var value = chars[i].contents;
            if (value === "\r") {
                if (afterBreak < 0) afterBreak = i + 1;
                else lastBreak = i;
            } else if (afterBreak >= 0 && typeof value === "string" &&
                       /^[ \t\u00A0\u2000-\u200A\u202F\u205F\u3000]+$/.test(value)) {
                // Spaces and tabs alone do not make an empty paragraph meaningful.
            } else {
                if (lastBreak >= afterBreak && afterBreak >= 0)
                    ranges.push([start + afterBreak, start + lastBreak]);
                afterBreak = -1;
                lastBreak = -1;
            }
        }
        if (lastBreak >= afterBreak && afterBreak >= 0)
            ranges.push([start + afterBreak, start + lastBreak]);

        if (!ranges.length) {
            alert("No repeated paragraph breaks found in the selected text.");
            return;
        }
        app.doScript(function () {
            // Delete backwards so the remaining character indices stay valid.
            for (var r = ranges.length - 1; r >= 0; r--)
                story.characters.itemByRange(ranges[r][0], ranges[r][1]).remove();
        }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT,
           "Remove Empty Paragraphs (Token Styler)");
    }

    var btnClose = foot.add("button", undefined, "Close");
    btnClose.onClick = function () {
        try { w.close(); } catch(_) {}
        try { $.global.__tokenStylerWin = null; } catch(_) {}
    };

    // =========================
    // Logic helpers / save
    // =========================
    function saveUIToLabels(doc, chosen) {
        for (var i=1;i<=20;i++)
            doc.insertLabel("LetterSeries"+i, String(inputs[i].text || "").toUpperCase());

        doc.insertLabel("ResetOnEmptyPara",       String(cbEmpty.value));
        doc.insertLabel("ResetOnBullets",         String(cbBullets.value));
        doc.insertLabel("TreatDashesAsBullets",    String(cbDashBullets.value));
        doc.insertLabel("ResetPerFrame",          String(cbResetPerFrame.value));
        doc.insertLabel("RunOnSelectionOnly",     String(cbSelectionOnly.value));
        doc.insertLabel("LastRunSeries",          String(chosen));
        doc.insertLabel("AllowQuestionHeading",   String(cbQuestionHeading.value));

        var hw = parseInt(headingMaxWordsEdit.text, 10);
        if (isNaN(hw) || hw < 1) hw = 18;
        doc.insertLabel("HeadingMaxWords", String(hw));

        var bulletToken = trimES(bulletEdit.text).toUpperCase();
        if (!/^[A-Z]\d+$/.test(bulletToken)) bulletToken = "";
        doc.insertLabel("BulletToken", bulletToken);

        lastNote.text = "Last used: Series " + chosen;
    }

    function runTokenStyler(chosen) {
        var doc = ensureDoc();

        if (app.selection.length === 0) {
            alert("Select a text frame, place the cursor in a text frame, or select text.");
            return;
        }

        var hw = parseInt(headingMaxWordsEdit.text, 10);
        if (isNaN(hw) || hw < 1) hw = 18;
        var maxHeadingWords = hw;

        var allowQuestionHeading = cbQuestionHeading.value;

        saveUIToLabels(doc, chosen);

        var storedBulletToken = trimES(bulletEdit.text).toUpperCase();
        var bulletToken = (/^[A-Z]\d+$/.test(storedBulletToken) ? storedBulletToken : "");

        var raw = String(inputs[chosen].text || "").toUpperCase();

        // >>> LAST + PRELAST tokens
        var lastTokenForStory    = null;
        var prelastTokenForStory = null;

        // Loop detekteres via [ ... ] eller // til sidst
        var loopThisRun = false;

        function parseSeries(seriesRaw) {
            var positions = [];
            var rawS = (seriesRaw == null ? "" : (seriesRaw + "").toUpperCase());

            // 1) Klammer: [ ... ] = loop på indholdet
            var m = rawS.match(/\[([^\]]+)\]/);
            if (m && m[1]) {
                loopThisRun = true;
                rawS = m[1];
            } else {
                // 2) Slutmarkør: // = loop på hele serien
                if (/\/\/\s*$/.test(rawS)) {
                    loopThisRun = true;
                    rawS = rawS.replace(/\/\/\s*$/, "");
                }
            }

            var parts = rawS.split(/[,\s]+/);
            for (var i = 0; i < parts.length; i++) {
                var t = trimES(parts[i]);
                if (!t) continue;

                // CONDITIONAL: B1/A3 eller B1+T2/A3+T3
                if (t.indexOf("/") >= 0) {
                    var pair = t.split("/");
                    if (pair.length === 2) {
                        var leftRaw  = trimES(pair[0]);
                        var rightRaw = trimES(pair[1]);

                        var headTokens = [];
                        var bodyTokens = [];

                        var leftParts = leftRaw.split("+");
                        for (var li = 0; li < leftParts.length; li++) {
                            var ls = trimES(leftParts[li]);
                            if (ls && /^[A-Z]\d+$/.test(ls)) headTokens.push(ls);
                        }

                        var rightParts = rightRaw.split("+");
                        for (var ri = 0; ri < rightParts.length; ri++) {
                            var rs = trimES(rightParts[ri]);
                            if (rs && /^[A-Z]\d+$/.test(rs)) bodyTokens.push(rs);
                        }

                        if (headTokens.length && bodyTokens.length) {
                            positions.push(["__COND_HEAD__", headTokens, bodyTokens]);
                            continue;
                        }
                    }
                }

                // LAST:...
                if (t.indexOf("LAST:") === 0) {
                    var tail = trimES(t.substring(5));
                    var subsL = tail.split("+");
                    var cleanL = [];
                    for (var lk=0; lk<subsL.length; lk++) {
                        var sl = trimES(subsL[lk]);
                        if (sl && /^[A-Z]\d+$/.test(sl)) cleanL.push(sl);
                    }
                    if (cleanL.length) lastTokenForStory = cleanL;
                    continue;
                }

                // PRELAST:...
                if (t.indexOf("PRELAST:") === 0) {
                    var tailP = trimES(t.substring(8));
                    var subsP = tailP.split("+");
                    var cleanP = [];
                    for (var pk=0; pk<subsP.length; pk++) {
                        var sp = trimES(subsP[pk]);
                        if (sp && /^[A-Z]\d+$/.test(sp)) cleanP.push(sp);
                    }
                    if (cleanP.length) prelastTokenForStory = cleanP;
                    continue;
                }

                // normal token-linje (evt. med +)
                var subs = t.split("+");
                var clean = [];
                for (var k = 0; k < subs.length; k++) {
                    var s = trimES(subs[k]);
                    if (s && /^[A-Z]\d+$/.test(s)) clean.push(s);
                }
                if (clean.length > 0) positions.push(clean);
            }
            return positions;
        }

        var positions = parseSeries(raw);
        if (positions.length === 0) {
            alert("Enter at least one token in the selected series (e.g. A1,B1/A3 or [I1,I2,I3] or I1,I2,I3//).");
            return;
        }

        // ---- Stilopslag ----
        var allPara = doc.allParagraphStyles;
        var allChar = doc.allCharacterStyles;

        function findStyleForTokenIn(list, token) {
            var exact = null, pref = null;
            for (var s = 0; s < list.length; s++) {
                var st = list[s], nm = (st.name || "");
                if (!nm || nm.charAt(0) === "[") continue;
                var up = nm.toUpperCase();
                if (up === token) { exact = st; break; }
                if (!pref && up.indexOf(token) === 0) pref = st;
            }
            return exact || pref || null;
        }

        var tokenMap = {};
        function ensureTokenEntry(tk){
            if (!tokenMap.hasOwnProperty(tk)) tokenMap[tk] = {p:null, c:null};
        }

        // map tokens (inkl. conditional)
        for (var i2 = 0; i2 < positions.length; i2++) {
            var subs2 = positions[i2];

            if (subs2[0] === "__COND_HEAD__") {
                var headArr = subs2[1];
                var bodyArr = subs2[2];
                var both = [headArr, bodyArr];

                for (var bi = 0; bi < both.length; bi++) {
                    var arr = both[bi];
                    for (var tj = 0; tj < arr.length; tj++) {
                        var tk = arr[tj];
                        ensureTokenEntry(tk);
                        if (!tokenMap[tk].p) tokenMap[tk].p = findStyleForTokenIn(allPara, tk);
                        if (!tokenMap[tk].c) tokenMap[tk].c = findStyleForTokenIn(allChar, tk);
                    }
                }
            } else {
                for (var j2 = 0; j2 < subs2.length; j2++) {
                    var tk2 = subs2[j2];
                    ensureTokenEntry(tk2);
                    if (!tokenMap[tk2].p) tokenMap[tk2].p = findStyleForTokenIn(allPara, tk2);
                    if (!tokenMap[tk2].c) tokenMap[tk2].c = findStyleForTokenIn(allChar, tk2);
                }
            }
        }

        // map LAST/PRELAST tokens
        if (lastTokenForStory) {
            for (var lt=0; lt<lastTokenForStory.length; lt++) {
                var ltk = lastTokenForStory[lt];
                ensureTokenEntry(ltk);
                if (!tokenMap[ltk].p) tokenMap[ltk].p = findStyleForTokenIn(allPara, ltk);
                if (!tokenMap[ltk].c) tokenMap[ltk].c = findStyleForTokenIn(allChar, ltk);
            }
        }
        if (prelastTokenForStory) {
            for (var pt=0; pt<prelastTokenForStory.length; pt++) {
                var ptk = prelastTokenForStory[pt];
                ensureTokenEntry(ptk);
                if (!tokenMap[ptk].p) tokenMap[ptk].p = findStyleForTokenIn(allPara, ptk);
                if (!tokenMap[ptk].c) tokenMap[ptk].c = findStyleForTokenIn(allChar, ptk);
            }
        }

        // map bullet-token (hvis udfyldt)
        var useBulletToken = cbBullets.value && bulletToken !== "";
        if (useBulletToken) {
            ensureTokenEntry(bulletToken);
            if (!tokenMap[bulletToken].p) tokenMap[bulletToken].p = findStyleForTokenIn(allPara, bulletToken);
            if (!tokenMap[bulletToken].c) tokenMap[bulletToken].c = findStyleForTokenIn(allChar, bulletToken);
        }

        // ---- Utils ----
        function isEmptyParagraph(p) { return trimES(p.contents) === ""; }

        function isBulletParagraph(p) {
            // InDesign bullets are list formatting; their marker need not occur in contents.
            try {
                if (p.bulletsAndNumberingListType === ListType.BULLET_LIST) return true;
            } catch (_) {}
            var t = trimES(p.contents);
            if (!t) return false;
            if (/^[•◦▪▫‣⁃●○■□*°º·][\t \u00A0\u0007]/.test(t)) return true;
            // A dash alone cannot distinguish a heading continuation from a list item.
            // Keep it in the normal token sequence unless explicitly opted in.
            return cbDashBullets.value && /^[-–—][\t \u00A0\u0007]/.test(t);
        }

        function collectSelectedTextFrames(sel) {
            var frames = [];
            function addFrame(tf) {
                if (!tf || !tf.isValid) return;
                for (var i=0;i<frames.length;i++) if (frames[i] === tf) return;
                frames.push(tf);
            }
            function walk(item) {
                if (!item || !item.isValid) return;
                if (item.constructor && item.constructor.name === "TextFrame") {
                    addFrame(item);
                    return;
                }
                if (item.hasOwnProperty("parentTextFrames") && item.parentTextFrames.length > 0) {
                    for (var i=0;i<item.parentTextFrames.length;i++) addFrame(item.parentTextFrames[i]);
                    return;
                }
                if (item.allPageItems) {
                    var kids = item.allPageItems;
                    for (var k=0;k<kids.length;k++) walk(kids[k]);
                }
            }
            if (sel instanceof Array) { for (var s=0; s<sel.length; s++) walk(sel[s]); }
            else { walk(sel); }

            frames.sort(function(a,b){
                function pageIndex(tf) {
                    try { var p = tf.parentPage; return p ? p.documentOffset : 1e9; }
                    catch(e){ return 1e9; }
                }
                var pa = pageIndex(a), pb = pageIndex(b);
                if (pa !== pb) return pa - pb;
                var ga = a.geometricBounds, gb = b.geometricBounds;
                if (ga[0] !== gb[0]) return ga[0] - gb[0];
                return ga[1] - gb[1];
            });
            return frames;
        }

        function paragraphsInFrame(tf) {
            var out = [];
            try {
                var paras = tf.parentStory.paragraphs;
                for (var i=0;i<paras.length;i++) {
                    var p = paras[i];
                    if (p.parentTextFrames && p.parentTextFrames.length > 0 && p.parentTextFrames[0] === tf) out.push(p);
                }
            } catch(e){}
            return out;
        }

        function paragraphsInSelection(selectionObj) {
            try {
                if (selectionObj.hasOwnProperty("paragraphs")) {
                    var ps = selectionObj.paragraphs, arr = [];
                    for (var i=0;i<ps.length;i++) arr.push(ps[i]);
                    return arr;
                }
            } catch(e){}
            return [];
        }

        // ---- Mini-liste detektor ----
        var forceBodyById = {};

        function simpleHeadingCandidate(p) {
            var t = trimES(p.contents);
            if (!t) return false;

            if (isBulletParagraph(p)) return false;

            while (t.length > 0 && /["'”’)\]]/.test(t.charAt(t.length - 1))) {
                t = t.substring(0, t.length - 1);
                t = trimES(t);
            }
            if (!t) return false;

            var lastChar = t.charAt(t.length - 1);
            if (/[\.!\?…:;]/.test(lastChar)) {
                if (!(allowQuestionHeading && lastChar === "?")) return false;
            }

            var words = t.split(/\s+/);
            if (words.length > maxHeadingWords) return false;
            if (t.length > 140) return false;

            return true;
        }

        function prepareHeadingRunMap(paragraphs) {
            forceBodyById = {};
            var n = paragraphs.length;
            var cand = [];

            for (var i = 0; i < n; i++) {
                cand[i] = simpleHeadingCandidate(paragraphs[i]);
            }

            var i = 0;
            while (i < n) {
                if (!cand[i]) { i++; continue; }

                var j = i + 1;
                while (j < n && cand[j]) j++;

                var runLen = j - i;
                if (runLen >= 3) {
                    for (var k = i; k < j; k++) {
                        try { forceBodyById[paragraphs[k].id] = true; } catch(e){}
                    }
                }
                i = j;
            }
        }

        function isHeadingParagraph(p) {
            try {
                if (forceBodyById[p.id]) return false;
            } catch(e){}
            return simpleHeadingCandidate(p);
        }

        // ---- Styling-state ----
        var posIdx = 0, appliedP = 0, appliedC = 0, resets = 0;

        function applyCompositeToParagraph(para, compositeTokensArr) {
            if (!compositeTokensArr || !compositeTokensArr.length) return;

            if (compositeTokensArr[0] === "__COND_HEAD__") {
                var headTokens = compositeTokensArr[1];
                var bodyTokens = compositeTokensArr[2];

                var chosenTokens = isHeadingParagraph(para) ? headTokens : bodyTokens;

                for (var i = 0; i < chosenTokens.length; i++) {
                    var t = chosenTokens[i];
                    var e = tokenMap[t];
                    if (e && e.p) { para.appliedParagraphStyle = e.p; appliedP++; break; }
                }

                for (var j = 0; j < chosenTokens.length; j++) {
                    var t2 = chosenTokens[j];
                    var e2 = tokenMap[t2];
                    if (e2 && e2.c) {
                        try { para.characters.everyItem().appliedCharacterStyle = e2.c; appliedC++; } catch(_){}
                    }
                }
                return;
            }

            var realTokens = compositeTokensArr;

            for (var i2=0; i2<realTokens.length; i2++) {
                var tP = realTokens[i2], eP = tokenMap[tP];
                if (eP && eP.p) { para.appliedParagraphStyle = eP.p; appliedP++; break; }
            }
            for (var j2=0; j2<realTokens.length; j2++) {
                var tC = realTokens[j2], eC = tokenMap[tC];
                if (eC && eC.c) {
                    try { para.characters.everyItem().appliedCharacterStyle = eC.c; appliedC++; } catch(_){}
                }
            }
        }

        function applyLastToLastParagraph(paragraphs) {
            if (!lastTokenForStory || !paragraphs || !paragraphs.length) return;
            for (var i = paragraphs.length - 1; i >= 0; i--) {
                var p = paragraphs[i];
                if (trimES(p.contents) === "") continue;
                for (var t=0; t<lastTokenForStory.length; t++) {
                    var tk = lastTokenForStory[t];
                    var e = tokenMap[tk];
                    if (!e) continue;
                    if (e.p) p.appliedParagraphStyle = e.p;
                    if (e.c) { try { p.characters.everyItem().appliedCharacterStyle = e.c; } catch(_){ } }
                }
                break;
            }
        }

        function applyPrelastToParagraphs(paragraphs) {
            if (!prelastTokenForStory || !paragraphs || paragraphs.length < 2) return;
            var count = paragraphs.length;
            var found = 0;
            var targetIndex = -1;
            for (var i = count - 1; i >= 0; i--) {
                if (trimES(paragraphs[i].contents) === "") continue;
                found++;
                if (found === 2) { targetIndex = i; break; }
            }
            if (targetIndex < 0) return;

            var p = paragraphs[targetIndex];
            for (var t=0; t<prelastTokenForStory.length; t++) {
                var tk = prelastTokenForStory[t];
                var e = tokenMap[tk];
                if (!e) continue;
                if (e.p) p.appliedParagraphStyle = e.p;
                if (e.c) { try { p.characters.everyItem().appliedCharacterStyle = e.c; } catch(_){ } }
            }
        }

        // Serie-fremdrift: clamp (default) eller loop når [..] eller // bruges
        function styleParagraphWithSeries(para) {
            if (!positions || !positions.length) return;

            if (posIdx < 0) posIdx = 0;
            if (posIdx >= positions.length) posIdx = positions.length - 1;

            var composite = positions[posIdx];
            applyCompositeToParagraph(para, composite);

            if (loopThisRun) {
                posIdx = (posIdx + 1) % positions.length;
            } else {
                var maxIndex = positions.length - 1;
                if (posIdx < maxIndex) posIdx++;
                else posIdx = maxIndex;
            }
        }

        // ---- Kør styling i ét undo-step ----
        app.doScript(function () {
            var useSelectionOnly = cbSelectionOnly.value;
            var selectionParas = [];

            if (useSelectionOnly) {
                try { selectionParas = paragraphsInSelection(app.selection[0]); } catch(e) {}
            }

            function handleParagraph(para) {
                // 1) Bullet-afsnit
                if (cbBullets.value && isBulletParagraph(para)) {
                    if (useBulletToken && tokenMap[bulletToken]) {
                        var eB = tokenMap[bulletToken];
                        if (eB.p) { para.appliedParagraphStyle = eB.p; appliedP++; }
                        if (eB.c) { try { para.characters.everyItem().appliedCharacterStyle = eB.c; appliedC++; } catch(_){ } }
                    }
                    resets++;
                    posIdx = 0;
                    return;
                }

                // 2) Tomme afsnit = reset og hop videre (ingen styling på tom linje)
                if (cbEmpty.value && isEmptyParagraph(para)) {
                    resets++;
                    posIdx = 0;
                    return;
                }

                // 3) Normal serie-styling
                styleParagraphWithSeries(para);
            }

            function runOnParagraphArray(paragraphs) {
                prepareHeadingRunMap(paragraphs);

                for (var p = 0; p < paragraphs.length; p++) handleParagraph(paragraphs[p]);

                applyPrelastToParagraphs(paragraphs);
                applyLastToLastParagraph(paragraphs);
            }

            if (useSelectionOnly && selectionParas.length > 0) {
                posIdx = 0;
                runOnParagraphArray(selectionParas);

            } else {
                var selectionItems = app.selection && app.selection.length ? app.selection : [];
                var frames = collectSelectedTextFrames(selectionItems);

                if (!frames || frames.length === 0) {
                    var sel = app.selection[0];
                    try {
                        if (sel && sel.constructor && sel.constructor.name === "TextFrame") frames = [sel];
                        else if (sel && sel.hasOwnProperty("parentTextFrames") && sel.parentTextFrames.length > 0) frames = [sel.parentTextFrames[0]];
                    } catch(e){}
                }
                if (!frames || frames.length === 0) throw new Error("Could not find any text frames in the selection.");

                for (var f = 0; f < frames.length; f++) {
                    var tf = frames[f];
                    if (cbResetPerFrame.value) posIdx = 0;
                    var paragraphs = paragraphsInFrame(tf);
                    runOnParagraphArray(paragraphs);
                }
            }
        }, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT,
           "Apply paragraph/character styles (Token Styler, series " + chosen + ")" );
    }

    // --- Collapse behavior (SAFE: clamp body height, don't toggle visible) ---
    w.layout.layout(true);

    // Efter første layout: sync knapbredder når UI faktisk er vist
    w.onShow = function () {
        syncRunButtonWidths();
        w.layout.layout(true);
        w.update();
    };

    w.onResizing = w.onResize = function () {
        this.layout.resize();
        syncRunButtonWidths();
    };

    var expandedSize = [w.size.width, w.size.height];
    var collapsedH   = header.size.height + 15;

    var isCollapsed = false;

    collapseBtn.onClick = function () {
        isCollapsed = !isCollapsed;
        collapseBtn.text = isCollapsed ? "▸" : "▾";

        if (isCollapsed) {
            body.enabled = false;
            body.minimumSize.height = 0;
            body.maximumSize.height = 0;
            w.size = [expandedSize[0], collapsedH];
        } else {
            body.minimumSize.height = 0;
            body.maximumSize.height = 10000;
            body.enabled = true;
            w.size = expandedSize;
        }

        w.layout.layout(true);
        w.update();
    };

    w.center();
    w.show();

})();
