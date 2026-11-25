//DESCRIPTION: Paragraph Line Tweak v.1.0.6 — One line more, one line less. Fine-tune tracking and fold away when done.

/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided "as is", without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/

#target "indesign"
#targetengine "paragraphLineTweakPalette"

// Modeless palette. Each adjustment/reset is one InDesign undo step.
// Reset restores only properties changed here, never unrelated document edits.
(function () {
    if ($.global.paragraphLineTweakWindow) {
        try {
            $.global.paragraphLineTweakWindow.show();
            if ($.global.paragraphLineTweakWindow.expandPalette)
                $.global.paragraphLineTweakWindow.expandPalette();
            return;
        } catch (ignored) {}
    }

    var history = [];
    var w = new Window("palette", "takeiteasy.dk");
    $.global.paragraphLineTweakWindow = w;
    w.orientation = "column";
    w.alignChildren = "left";
    w.margins = 10;
    var header = w.add("group");
    header.spacing = 8;
    var fold = header.add("button", undefined, "Collapse");
    fold.preferredSize = [76, 24];
    header.add("statictext", undefined, "Paragraph Line Tweak");
    var body = w.add("group");
    body.orientation = "column";
    body.alignChildren = "left";
    var collapsed = false;
    var expandedSize;

    function setCollapsed(value) {
        if (value === collapsed) return;
        var position = [w.location.x, w.location.y];
        if (value) expandedSize = [w.size.width, w.size.height];
        collapsed = value;
        body.visible = !collapsed;
        body.maximumSize = collapsed ? [0, 0] : [10000, 10000];
        body.preferredSize = collapsed ? [0, 0] : [-1, -1];
        fold.text = collapsed ? "Expand" : "Collapse";
        fold.helpTip = collapsed ? "Show all controls." : "Fold the palette into a small bar.";
        w.layout.layout(true);
        w.size = collapsed ? [260, header.size.height + 20] : expandedSize;
        w.layout.resize();
        w.location = position;
    }
    fold.helpTip = "Fold the palette into a small bar.";
    fold.onClick = function () { setCollapsed(!collapsed); };
    // Running the script again also brings a folded palette back into view.
    w.expandPalette = function () { setCollapsed(false); };
    var chk = body.add("checkbox", undefined, "Use full justification (recommended for longer paragraphs)");
    var g = body.add("group");
    var less = g.add("button", undefined, "1 line less");
    var more = g.add("button", undefined, "1 line more");
    var reset = g.add("button", undefined, "Reset last tweak");
    var close = g.add("button", undefined, "Close");
    var status = body.add("statictext", undefined, "Select a paragraph, then choose an adjustment.", {multiline: true});
    status.preferredSize = [440, 20];
    reset.enabled = false;
    reset.helpTip = "Restore the latest tweak. Click again to restore earlier tweaks from this palette session.";

    var trackingGroup = body.add("group");
    trackingGroup.spacing = 5;
    trackingGroup.add("statictext", undefined, "Tracking:");
    var trackingButtons = [];
    var trackingValues = [-15, -10, -5, 0, 5, 10, 15];
    for (var ti = 0; ti < trackingValues.length; ti++) {
        addTrackingButton(trackingValues[ti]);
    }

    function addTrackingButton(value) {
        var button = trackingGroup.add("button", undefined, value > 0 ? "+" + value : String(value));
        button.preferredSize = [42, 24];
        button.helpTip = "Set tracking to " + value + ". Applies to selected text, or the current paragraph when only the text cursor is placed.";
        button.onClick = function () {
            run(function () { setTracking(value); }, "Set Tracking " + value);
        };
        trackingButtons.push(button);
    }

    function selectedTrackingText() {
        selectedParagraph(); // Validate that this is a text selection.
        var selection = app.selection[0];
        if (selection.constructor.name === "InsertionPoint") return selection.paragraphs[0];
        if (!selection.characters || !selection.characters.length)
            throw Error("Select text or place the text cursor in a paragraph.");
        return selection;
    }

    function setTracking(value) {
        var text = selectedTrackingText();
        var s = snapshot(text, true);
        try {
            text.tracking = value;
            s.story.recompose();
            history.push(s);
            status.text = "Tracking set to " + value + ". Reset is available.";
        } catch (error) {
            try { restore(s); } catch (restoreError) {
                throw Error(error.message + "\nRestoration failed: " + restoreError.message + "\nUse InDesign Undo to undo this operation.");
            }
            throw error;
        }
    }

    function selectedParagraph() {
        if (!app.documents.length || app.selection.length !== 1)
            throw Error("Place the text cursor in a paragraph or select text.");
        var s = app.selection[0];
        // A frame selection is ambiguous: require a text selection instead.
        if (s.constructor.name === "TextFrame" || !s.paragraphs || !s.paragraphs.length)
            throw Error("Place the text cursor in a paragraph or select text.");
        return s.paragraphs[0];
    }

    function snapshot(p, trackingOnly) {
        var runs = [], ranges = p.textStyleRanges;
        for (var i = 0; i < ranges.length; i++) {
            var r = ranges[i];
            var text = p.parentStory.characters.itemByRange(
                r.characters[0].index, r.characters[-1].index
            ).getElements()[0];
            runs.push({text: text, contents: r.contents, tracking: r.tracking});
        }
        if (trackingOnly) return {
            paragraph: p.getElements()[0], story: p.parentStory,
            contents: p.contents, runs: runs, trackingOnly: true
        };
        return {
            paragraph: p.getElements()[0], story: p.parentStory,
            contents: p.contents, runs: runs,
            justification: p.justification, hyphenation: p.hyphenation,
            minWS: p.minimumWordSpacing, desWS: p.desiredWordSpacing,
            maxWS: p.maximumWordSpacing
        };
    }

    function wordSpacing(p, min, desired, max) {
        // Expand limits before setting the desired value, then narrow them.
        p.minimumWordSpacing = 0;
        p.maximumWordSpacing = 1000;
        p.desiredWordSpacing = desired;
        p.minimumWordSpacing = min;
        p.maximumWordSpacing = max;
    }

    function restore(s) {
        var p = s.paragraph;
        for (var i = 0; i < s.runs.length; i++) s.runs[i].text.tracking = s.runs[i].tracking;
        if (!s.trackingOnly) {
            wordSpacing(p, s.minWS, s.desWS, s.maxWS);
            p.justification = s.justification;
            p.hyphenation = s.hyphenation;
        }
        s.story.recompose();
    }

    function validate(s) {
        if (!s.paragraph.isValid || !s.story.isValid || s.paragraph.contents !== s.contents)
            throw Error("The saved paragraph was edited or its document was closed. Reset cannot safely restore it.");
        for (var i = 0; i < s.runs.length; i++) {
            if (!s.runs[i].text.isValid || s.runs[i].text.contents !== s.runs[i].contents)
                throw Error("The saved text range changed. Reset cannot safely restore it.");
        }
    }

    function tweak(delta) {
        var p = selectedParagraph();
        var before = p.lines.length, target = before + delta;
        if (before === 0) throw Error("The paragraph must have visible composed lines.");
        if (target < 1) throw Error("Paragraph is already very short.");
        var s = snapshot(p), found = false;
        try {
            if (chk.value) p.justification = Justification.FULLY_JUSTIFIED;
            p.hyphenation = true;
            for (var offset = -20; offset <= 20 && !found; offset++) {
                for (var i = 0; i < s.runs.length; i++)
                    s.runs[i].text.tracking = s.runs[i].tracking + offset;
                for (var desired = 90; desired <= 110; desired += 2) {
                    wordSpacing(p, desired - 10, desired, desired + 10);
                    s.story.recompose();
                    if (p.lines.length === target) { found = true; break; }
                }
            }
            if (!found) {
                restore(s);
                status.text = "No exact match found. Original settings restored.";
                return;
            }
            history.push(s);
            status.text = "Adjusted from " + before + " to " + target + " lines. Reset is available.";
        } catch (error) {
            try { restore(s); } catch (restoreError) {
                throw Error(error.message + "\nRestoration failed: " + restoreError.message + "\nUse InDesign Undo to undo this operation.");
            }
            throw error;
        }
    }

    function run(action, label) {
        var redraw = app.scriptPreferences.enableRedraw;
        less.enabled = more.enabled = reset.enabled = false;
        trackingGroup.enabled = false;
        try {
            app.scriptPreferences.enableRedraw = false;
            app.doScript(action, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, label);
        } catch (error) {
            alert(error.message || String(error));
        } finally {
            app.scriptPreferences.enableRedraw = redraw;
            less.enabled = more.enabled = true;
            trackingGroup.enabled = true;
            reset.enabled = history.length > 0;
        }
    }

    less.onClick = function () { run(function () { tweak(-1); }, "Paragraph Line Tweak"); };
    more.onClick = function () { run(function () { tweak(1); }, "Paragraph Line Tweak"); };
    reset.onClick = function () {
        if (!history.length) return;
        run(function () {
            var s = history[history.length - 1];
            validate(s);
            restore(s);
            history.pop();
            status.text = "Previous settings restored. " + history.length + " tweak(s) left to reset.";
        }, "Reset Paragraph Line Tweak");
    };
    close.onClick = function () { w.close(); };
    w.onClose = function () { $.global.paragraphLineTweakWindow = null; };
    w.show();
}());
