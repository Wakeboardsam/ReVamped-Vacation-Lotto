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

/**
 * Queue State Getters and Setters
 */

function getQueueState() {
  var config = getSystemConfig();
  return {
    phase: config['Current Phase'] || 'SETUP_EMPTY',
    round: parseInt(config['Current Round']) || 1,
    direction: config['Current Direction'] || 'ASCENDING',
    lead: parseInt(config['Current Lead']) || 1
  };
}

function setQueueState(updates) {
  var formattedUpdates = {};
  if (updates.phase !== undefined) formattedUpdates['Current Phase'] = updates.phase;
  if (updates.round !== undefined) formattedUpdates['Current Round'] = updates.round;
  if (updates.direction !== undefined) formattedUpdates['Current Direction'] = updates.direction;
  if (updates.lead !== undefined) formattedUpdates['Current Lead'] = updates.lead;

  if (Object.keys(formattedUpdates).length > 0) {
    setSystemConfig(formattedUpdates);
  }
}

function getActiveWindowSize(phase) {
  var adminOptions = getAdminOptions();

  if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
    return parseInt(adminOptions['Vacation Active Window (participants)']) || 3;
  } else if (phase === 'WEEKEND') {
    return parseInt(adminOptions['Weekend Active Window (participants)']) || 2;
  } else if (phase === 'HOLIDAY_VOLUNTEER' || phase === 'HOLIDAY_MANDATORY') {
    return parseInt(adminOptions['Holiday Active Window (participants)']) || 2;
  } else if (phase === 'TRANSFER_OFFER_COLLECTION' || phase === 'TRANSFER_RECEIVER') {
    return parseInt(adminOptions['Transfer Active Window (participants)']) || 2;
  }

  return 1; // Default fallback
}

function getSystemTarget(key, defaultVal) {
  var adminOptions = getAdminOptions();
  var val = parseInt(adminOptions[key]);
  return isNaN(val) ? defaultVal : val;
}
