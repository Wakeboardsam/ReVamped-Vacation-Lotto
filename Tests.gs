/**
 * Tests.gs - Regression Tests
 */

// Simple mock framework for Google Sheets
var MockSpreadsheetApp = {
  _sheets: {},
  createSheet: function(name, data) {
    this._sheets[name] = {
      getName: function() { return name; },
      getDataRange: function() {
        return {
          getValues: function() { return data; }
        };
      },
      getRange: function(row, col) {
        return {
          setValue: function(val) { data[row - 1][col - 1] = val; },
          setValues: function(vals) { for(var i=0; i<vals.length; i++){ for(var j=0; j<vals[i].length; j++){ data[row-1+i][col-1+j]=vals[i][j]; } } },
          clearContent: function() { data[row - 1][col - 1] = ''; }
        };
      },
      getLastRow: function() { return data.length; },
      getLastColumn: function() { return data[0].length; },
      appendRow: function(row) { data.push(row); }
    };
  },
  getActiveSpreadsheet: function() {
    var self = this;
    return {
      getSheetByName: function(name) { return self._sheets[name] || null; }
    };
  }
};

function runRegressionTests() {
  var log = [];
  function assert(condition, message) {
    if (!condition) {
      log.push("❌ FAIL: " + message);
      throw new Error("Test Failed: " + message);
    } else {
      log.push("✅ PASS: " + message);
    }
  }

  // Backup original globals
  var originalSpreadsheetApp = SpreadsheetApp;
  var originalWithScriptLock = withScriptLock;

  try {
    // 1. Mock dependencies
    SpreadsheetApp = MockSpreadsheetApp;
    withScriptLock = function(cb) { return cb(); };

    // 2. Setup isolated fixture data
    MockSpreadsheetApp.createSheet('Config', [
      ['Setting Name', 'Setting Value'],
      ['Current Phase', 'SETUP'],
      ['Current Round', '0'],
      ['Current Direction', 'NONE'],
      ['Current Lead', '0']
    ]);

    MockSpreadsheetApp.createSheet('Admin Options', [
      ['Setting Name', 'Setting Value'],
      ['Active Year', '2025'],
      ['Holiday Proximity Range (days)', '0'] // Test boundary/zero
    ]);

    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'Currently Active', 'Weekend Phase Enabled', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent'],
      ['Alice', true, true, 'time', true, true] // Note: 'Currently Active' is not used, but header is present
    ]);

    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Week ID', 'Start Date (Monday)', 'Capacity', 'Prime Classification', 'Special Week Designation', 'Assigned Participants'],
      [1, '2025-01-06', 1, 'Non-Prime', 'None', 'Alice, Bob']
    ]);

    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee', 'Vacation Adjacency Warning', 'Holiday Proximity Warning'],
      ['2025-01-04', 'Saturday', '', '', '']
    ]);

    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ["New Year's Day", '2025-01-01', 'Call 1', '']
    ]);

    // Test A: Adjacency formatting (Comma-separated exact matching)
    var affected = calculateVacationAdjacency_();
    assert(affected > 0, "calculateVacationAdjacency_ modified rows");

    var wData = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    assert(wData[1][3] === 'Alice, Bob', "Adjacency warning uses comma separation and precise exact names: " + wData[1][3]);

    // Test B: Weekend initialization resets state to Round 1, Ascending, Lead 1, clears timers, no partial failure
    // Because UI alert will throw in test, we mock getUi
    SpreadsheetApp.getUi = function() { return { alert: function(){} }; };

    beginWeekendPhase();

    var cData = MockSpreadsheetApp._sheets['Config'].getDataRange().getValues();
    assert(cData[1][1] === 'WEEKEND', "Phase set to WEEKEND");
    assert(cData[2][1] === 1, "Round set to 1");
    assert(cData[3][1] === 'ASCENDING', "Direction set to ASCENDING");
    assert(cData[4][1] === 1, "Lead set to 1");

    var pData = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    assert(pData[1][3] === '', "Entry Timestamp cleared");
    assert(pData[1][4] === false, "Reminder Sent cleared");
    assert(pData[1][5] === false, "Admin Alert Sent cleared");

    // Test C: Missing headers fail without partial writes
    MockSpreadsheetApp.createSheet('Weekend Coverage', [['BadHeader']]);
    var caught = false;
    try {
      calculateVacationAdjacency_();
    } catch (e) {
      caught = true;
    }
    assert(caught, "Missing headers fail correctly before changing state");

  } finally {
    // Restore globals
    SpreadsheetApp = originalSpreadsheetApp;
    withScriptLock = originalWithScriptLock;
  }

  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch(e) {}
  if (ui) {
    ui.alert("Test Log:\n" + log.join("\n"));
  } else {
    Logger.log(log.join("\n"));
  }
}
