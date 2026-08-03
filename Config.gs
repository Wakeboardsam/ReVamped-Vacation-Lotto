/**
 * Configuration manager for interacting with 'Admin Options' and 'Config' tabs
 */

function getConfig(sheetName, keyColumnIndex, valueColumnIndex) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return {};

  var data = sheet.getDataRange().getValues();
  var config = {};

  // Skip header row
  for (var i = 1; i < data.length; i++) {
    var key = data[i][keyColumnIndex];
    if (key) {
      config[key] = data[i][valueColumnIndex];
    }
  }

  return config;
}

function setConfig(sheetName, keyColumnIndex, valueColumnIndex, updates) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return;

  var dataRange = sheet.getDataRange();
  var data = dataRange.getValues();
  var updated = false;

  // Update existing keys
  var keysAdded = {};
  for (var i = 1; i < data.length; i++) {
    var key = data[i][keyColumnIndex];
    if (key && updates.hasOwnProperty(key)) {
      data[i][valueColumnIndex] = updates[key];
      keysAdded[key] = true;
      updated = true;
    }
  }

  // Append new keys
  for (var key in updates) {
    if (updates.hasOwnProperty(key) && !keysAdded[key]) {
      var newRow = new Array(data[0].length).fill('');
      newRow[keyColumnIndex] = key;
      newRow[valueColumnIndex] = updates[key];
      data.push(newRow);
      updated = true;
    }
  }

  if (updated) {
    // Write back entire range
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  }
}

function getAdminOptions() {
  // Admin Options: Key is Col A (0), Value is Col B (1)
  return getConfig('Admin Options', 0, 1);
}

function setAdminOptions(updates) {
  setConfig('Admin Options', 0, 1, updates);
}

function getSystemConfig() {
  // Config: Key is Col A (0), Value is Col B (1)
  return getConfig('Config', 0, 1);
}

function setSystemConfig(updates) {
  setConfig('Config', 0, 1, updates);
}
