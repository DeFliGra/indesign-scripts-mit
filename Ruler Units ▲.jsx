//DESCRIPTION: Ruler Units v1.0.0 — Switch ruler units on the fly from a floating panel.

/*
    InDesign ExtendScript 
    Copyright (c) 2026 www.TakeItEasy.dk
    Licensed under the MIT License.
    
    This script is provided "as is", without warranty of any kind.
    Use at your own risk. The author accepts no liability for any
    damages or data loss resulting from its use.
*/


#target "indesign"
#targetengine "RulerUnits"

(function () {
  var paletteKey = "rulerUnitsPalette";
  if ($.global[paletteKey]) {
    $.global[paletteKey].show();
    return;
  }

  var unitLabels = [
    "Points",
    "Picas",
    "Inches",
    "Inches (Decimal)",
    "Millimetres",
    "Centimetres",
    "Ciceros",
    "Agates",
    "Pixels"
  ];

  var unitValues = [
    MeasurementUnits.POINTS,
    MeasurementUnits.PICAS,
    MeasurementUnits.INCHES,
    MeasurementUnits.INCHES_DECIMAL,
    MeasurementUnits.MILLIMETERS,
    MeasurementUnits.CENTIMETERS,
    MeasurementUnits.CICEROS,
    MeasurementUnits.AGATES,
    MeasurementUnits.PIXELS
  ];

  var win = new Window("palette", "Ruler Units", undefined, { resizeable: true });
  win.orientation = "column";
  win.alignChildren = ["fill", "top"];
  win.spacing = 8;
  win.margins = 10;

  var foldButton = win.add("button", undefined, "- Ruler Units");
  foldButton.helpTip = "Collapse palette";

  var content = win.add("group");
  content.orientation = "column";
  content.alignChildren = ["fill", "top"];
  content.add("statictext", undefined, "Select ruler unit:");

  var radioGroup = content.add("panel");
  radioGroup.orientation = "column";
  radioGroup.alignChildren = "left";
  radioGroup.margins = 10;

  var radioButtons = [];
  for (var i = 0; i < unitLabels.length; i++) {
    radioButtons[i] = radioGroup.add("radiobutton", undefined, unitLabels[i]);
  }
  radioButtons[4].value = true;

  var applyButton = content.add("button", undefined, "Apply");
  applyButton.onClick = function () {
    if (!app.documents.length) {
      alert("Open a document first.");
      return;
    }

    for (var i = 0; i < radioButtons.length; i++) {
      if (!radioButtons[i].value) continue;
      try {
        var prefs = app.activeDocument.viewPreferences;
        prefs.horizontalMeasurementUnits = unitValues[i];
        prefs.verticalMeasurementUnits = unitValues[i];
      } catch (e) {
        alert("Error: " + e.message);
      }
      return;
    }
  };

  var collapsed = false;
  var compactSize = [160, 28];
  var expandedSize, expandedButtonBounds, expandedContentBounds;

  function copyBounds(control) {
    var bounds = control.bounds;
    return [bounds.left, bounds.top, bounds.right, bounds.bottom];
  }

  foldButton.onClick = function () {
    var position = [win.location.x, win.location.y];
    collapsed = !collapsed;
    content.visible = !collapsed;
    win.margins = collapsed ? 2 : 10;
    foldButton.text = (collapsed ? "+ " : "- ") + "Ruler Units";
    foldButton.helpTip = collapsed ? "Expand palette" : "Collapse palette";

    var size = collapsed ? compactSize : expandedSize;
    if (!collapsed) win.maximumSize = expandedSize;
    win.minimumSize = size;
    win.maximumSize = size;
    win.size = size;

    foldButton.bounds = collapsed ? [2, 2, 158, 26] : expandedButtonBounds;
    content.bounds = collapsed ? [0, 28, 0, 28] : expandedContentBounds;
    win.location = position;
    win.update();
  };

  win.onClose = function () {
    $.global[paletteKey] = null;
  };

  win.center();
  $.global[paletteKey] = win;
  win.show();
  expandedSize = [win.size.width, win.size.height];
  expandedButtonBounds = copyBounds(foldButton);
  expandedContentBounds = copyBounds(content);
  win.minimumSize = expandedSize;
  win.maximumSize = expandedSize;
}());
