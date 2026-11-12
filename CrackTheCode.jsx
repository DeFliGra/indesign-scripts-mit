//DESCRIPTION:Crack the Code - a tiny code-breaking game for Adobe InDesign.
// Version 1.2.0 | No document required. Does not change document contents.

/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided "as is", without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/

#target indesign
#targetengine "myaiCrackTheCode"

(function () {
    var KEY = "myai.crackTheCode.best.v1";
    if ($.global.myaiCodeWindow) {
        try {
            if ($.global.myaiCodeWindow.codeGameVersion === "1.2.0") {
                $.global.myaiCodeWindow.show(); return;
            }
            $.global.myaiCodeWindow.close();
        } catch (ignore) {}
    }
    var secret, guesses, finished, hinted, best = 0;
    try { best = parseInt(app.extractLabel(KEY), 10) || 0; } catch (ignore2) {}

    function makeCode() {
        var pool = "0123456789".split(""), code = "", i;
        for (i = 0; i < 4; i++) {
            code += pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        }
        return code;
    }
    function scoreGuess(code, guess) {
        var exact = 0, elsewhere = 0, i;
        for (i = 0; i < 4; i++) {
            if (guess.charAt(i) === code.charAt(i)) exact++;
            else if (code.indexOf(guess.charAt(i)) !== -1) elsewhere++;
        }
        return [exact, elsewhere];
    }
    var w = new Window("palette", "CRACK THE CODE · TAKEITEASY.DK", undefined, {resizeable:true});
    $.global.myaiCodeWindow = w;
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];
    w.spacing = 10;
    w.margins = [12, 8, 12, 8];
    w.codeGameVersion = "1.2.0";
    var collapsed = false, changingLayout = false, expandedSize;
    var header = w.add("group");
    header.alignment = ["fill", "top"];
    var toggle = header.add("button", undefined, "Boss Mode");
    toggle.preferredSize = [100, 24];
    var headerText = header.add("statictext", undefined, "CRACK THE CODE");
    var body = w.add("group");
    body.orientation = "column";
    body.alignChildren = ["fill", "top"];
    body.alignment = ["fill", "fill"];
    body.spacing = 10;
    body.margins = 0;

    var title = body.add("statictext", undefined, "Can you crack the safe?");
    try { title.graphics.font = ScriptUI.newFont(title.graphics.font.name, "BOLD", 18); } catch (fontError) {}
    var rules = body.add("statictext", undefined,
        "Find 4 different digits (0-9) in 8 turns.\nA code may start with 0. No repeated digits.", {multiline:true});
    rules.preferredSize = [390, 38];
    var stats = body.add("statictext", undefined, "");
    var board = body.add("listbox", undefined, [], {
        numberOfColumns:4, showHeaders:true,
        columnTitles:["Turn", "Guess", "Exact", "Elsewhere"],
        columnWidths:[48, 110, 90, 100]
    });
    board.alignment = ["fill", "fill"];
    board.preferredSize = [390, 210];
    board.minimumSize = [360, 150];
    var legend = body.add("statictext", undefined,
        "Exact = right digit and position.\nElsewhere = right digit, different position.", {multiline:true});
    legend.preferredSize.height = 34;
    var inputRow = body.add("group");
    inputRow.alignment = ["fill", "top"];
    inputRow.add("statictext", undefined, "Your code:");
    var input = inputRow.add("edittext", undefined, "");
    input.characters = 8;
    var submit = inputRow.add("button", undefined, "Unlock");
    var hint = inputRow.add("button", undefined, "Hint (-1 turn)");
    var noteRow = body.add("group");
    noteRow.alignment = ["fill", "top"];
    noteRow.alignChildren = ["left", "top"];
    noteRow.add("statictext", undefined, "Your note:");
    var note = noteRow.add("edittext", undefined, "", {multiline:true, scrolling:true});
    note.alignment = ["fill", "top"];
    note.preferredSize = [280, 56];
    note.minimumSize = [100, 56];
    note.maximumSize.height = 56;
    note.helpTip = "Your own notes. These do not affect guesses or points.";
    var lastEdit = input;
    input.onActivate = function () { lastEdit = input; };
    note.onActivate = function () { lastEdit = note; };
    var message = body.add("statictext", undefined, "", {multiline:true});
    message.preferredSize = [390, 54];
    var footer = body.add("group");
    var newGame = footer.add("button", undefined, "New game");
    var close = footer.add("button", undefined, "Close");

    function refresh() {
        stats.text = "Turns remaining: " + (8 - guesses) + "     |     Best score: " + best;
        input.enabled = submit.enabled = !finished;
        hint.enabled = !finished && guesses >= 2 && guesses < 7 && !hinted;
    }
    function endGame(won) {
        finished = true;
        if (won) {
            var points = (9 - guesses) * 100;
            message.text = "Safe opened! Code: " + secret + ". Score: " + points + ".";
            if (points > best) {
                best = points;
                try { app.insertLabel(KEY, String(best)); } catch (saveError) {}
            }
        } else message.text = "The safe stays locked! The code was " + secret + ".";
        refresh();
    }
    function addRow(turn, value, exact, elsewhere) {
        var row = board.add("item", String(turn));
        row.subItems[0].text = value;
        row.subItems[1].text = String(exact);
        row.subItems[2].text = String(elsewhere);
        board.selection = row;
    }
    function play() {
        if (finished || collapsed) return;
        var value = input.text.replace(/^\s+|\s+$/g, ""), i, result;
        if (!/^\d{4}$/.test(value)) {
            message.text = "Enter exactly four digits, for example 0372.";
            return;
        }
        for (i = 0; i < 4; i++) {
            if (value.indexOf(value.charAt(i)) !== i) {
                message.text = "Use four different digits. Repeated digits are not allowed.";
                return;
            }
        }
        for (i = 0; i < board.items.length; i++) {
            if (board.items[i].subItems[0].text === value) {
                message.text = "You already tried that code. Try a different one.";
                return;
            }
        }
        guesses++;
        result = scoreGuess(secret, value);
        addRow(guesses, value, result[0], result[1]);
        input.text = "";
        if (result[0] === 4) endGame(true);
        else if (guesses >= 8) endGame(false);
        else {
            message.text = result[0] + " exact, " + result[1] + " elsewhere. Keep cracking!";
            refresh();
            input.active = true;
        }
    }
    function reset() {
        secret = makeCode(); guesses = 0; finished = false; hinted = false;
        board.removeAll(); input.text = "";
        note.text = ""; lastEdit = input;
        message.text = "Your first move! A hint unlocks after two guesses.\nA hint reveals one position and uses one turn.";
        refresh(); input.active = true;
    }
    submit.onClick = play;
    input.addEventListener("keydown", function (event) {
        if (event.keyName === "Enter" || event.keyName === "Return") {
            event.preventDefault(); play();
        }
    });
    hint.onClick = function () {
        if (!hint.enabled) return;
        hinted = true; guesses++;
        var position = Math.floor(Math.random() * 4);
        var clue = "Position " + (position + 1) + " = " + secret.charAt(position);
        addRow(guesses, clue, "-", "-");
        message.text = "Hint: " + clue + ". One turn used.";
        refresh(); input.active = true;
    };
    newGame.onClick = function () {
        if (!finished && guesses > 0 && !confirm("Abandon this code and start a new game?")) return;
        reset();
    };
    close.onClick = function () { w.close(); };
    w.onClose = function () { $.global.myaiCodeWindow = null; return true; };
    function focusInput() {
        if (!collapsed) {
            // Restore the last edit field; notes remain editable after the game.
            var target = lastEdit;
            if (target === input && finished) target = note;
            target.active = false;
            target.active = true;
        }
    }
    // Cache natural control heights once. ScriptUI's automatic column layout
    // can distribute surplus height between rows on macOS; place them explicitly.
    var fixedHeights = [], headerHeight = 24, expandedMinHeight = 500;
    function captureLayout() {
        w.layout.layout(true);
        headerHeight = Math.max(24, header.size.height);
        var total = 0, i, child;
        for (i = 0; i < body.children.length; i++) {
            child = body.children[i];
            fixedHeights[i] = child === board ? 150 : child.size.height;
            total += fixedHeights[i];
        }
        expandedMinHeight = Math.max(500,
            16 + headerHeight + 10 + total + (body.children.length - 1) * 10);
    }
    function arrangeGame() {
        if (collapsed || !fixedHeights.length) return;
        var width = w.size.width - 24;
        var height = w.size.height - 16 - headerHeight - 10;
        header.bounds = [12, 8, 12 + width, 8 + headerHeight];
        body.bounds = [12, 8 + headerHeight + 10,
            12 + width, 8 + headerHeight + 10 + height];
        var fixed = (body.children.length - 1) * 10, i, child, h, y = 0;
        for (i = 0; i < body.children.length; i++) {
            if (body.children[i] !== board) fixed += fixedHeights[i];
        }
        for (i = 0; i < body.children.length; i++) {
            child = body.children[i];
            h = child === board ? Math.max(150, height - fixed) : fixedHeights[i];
            child.bounds = [0, y, width, y + h];
            if (child.type === "group") child.layout.resize();
            y += h + 10;
        }
    }
    toggle.onClick = function () {
        changingLayout = true;
        // Hiding during relayout refreshes native edittext controls on macOS.
        // Keep the same controls: unfinished input and the game state survive.
        if (!collapsed) expandedSize = [w.size.width, w.size.height];
        w.hide();
        collapsed = !collapsed;
        w.minimumSize = [0, 0];
        w.maximumSize = [10000, 10000];
        if (collapsed) {
            input.active = false;
            note.active = false;
            body.visible = false;
            body.minimumSize = [0, 0];
            body.maximumSize = [0, 0];
            w.spacing = 0;
            toggle.text = "Open Sesame";
            headerText.text = "Production tools";
            w.text = "Production tools – takeiteasy.dk";
            w.layout.layout(true);
            var compactH = header.size.height + 16;
            w.size = [expandedSize[0], compactH];
            w.minimumSize = [260, compactH];
            w.maximumSize = [10000, compactH];
        } else {
            body.maximumSize = [10000, 10000];
            body.visible = true;
            w.spacing = 10;
            toggle.text = "Boss Mode";
            headerText.text = "CRACK THE CODE";
            w.text = "CRACK THE CODE · TAKEITEASY.DK";
            w.layout.layout(true);
            w.minimumSize = [420, expandedMinHeight];
            w.size = expandedSize;
        }
        w.layout.resize();
        arrangeGame();
        w.show();
        changingLayout = false;
        refresh();
        focusInput();
    };
    w.onActivate = focusInput;
    w.onResizing = w.onResize = function () {
        if (!changingLayout) {
            this.layout.resize();
            arrangeGame();
        }
    };
    reset();
    captureLayout();
    w.minimumSize = [420, expandedMinHeight];
    w.size = [Math.max(420, w.size.width), Math.max(expandedMinHeight, w.size.height)];
    arrangeGame();
    w.center(); w.show();
    focusInput();
})();
