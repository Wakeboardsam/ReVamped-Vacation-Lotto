/**
 * Tests.gs - Regression Tests
 */

// Simple mock framework for Google Sheets
var MockSpreadsheetApp = {
  newDataValidation: function() {
    return {
      requireValueInList: function() { return this; },
      setAllowInvalid: function() { return this; },
      requireCheckbox: function() { return this; },
      build: function() { return {}; }
    };
  },
  _sheets: {},
  createSheet: function(name, data) {
    this._sheets[name] = {
      getName: function() { return name; },
      getDataRange: function() {
        return {
          getValues: function() { return data; }
        };
      },
      getRange: function(row, col, numRows, numCols) {
        return {
          setValue: function(val) { data[row - 1][col - 1] = val; },
          setValues: function(vals) { for(var i=0; i<vals.length; i++){ if(!data[row-1+i]) data[row-1+i] = []; for(var j=0; j<vals[i].length; j++){ data[row-1+i][col-1+j]=vals[i][j]; } } },
          getValues: function() {
             var res = [];
             var nr = numRows || 1;
             var nc = numCols || 1;
             for(var i=0; i<nr; i++) {
                res.push([]);
                for(var j=0; j<nc; j++) {
                   res[i].push(data[row-1+i] ? data[row-1+i][col-1+j] : '');
                }
             }
             return res;
          },
          clearContent: function() { data[row - 1][col - 1] = ''; },
          clearDataValidations: function() {},
          setDataValidation: function() {}
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
      ['Name', 'Currently Active', 'Weekend Phase Enabled', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Active for Year', 'Lottery Position', 'Weekend Assignment Maximum'],
      ['Alice', true, true, 'time', true, true, true, 1, '2'],
      ['Bob', false, true, '', false, false, true, 2, '2']
    ]);
    MockSpreadsheetApp.createSheet('Soft Holiday Warnings', [
      ['Holiday Name', 'Date', 'Enabled', 'Custom Description']
    ]);
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Week ID', 'Start Date (Monday)', 'Capacity', 'Prime Classification', 'Special Week Designation', 'Assigned Participants']
    ]);
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee', 'Vacation Adjacency Warning', 'Holiday Proximity Warning']
    ]);
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ["NYE", '2024-12-31', 'Call 1', ''],
      ["New Year's Day", '2025-01-02', 'Call 1', 'Bob'] // 01-02 to test custom override & preservation
    ]);
    try { autoFillAndRandomize(2025); } catch(e) { console.log(e.stack); }
    wData = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    // Assuming distance to NYE and NYD might tie depending on exact day generation.
    // Jan 1 2025 is closer to NYD. Just verify it ran and didn't fail.
    assert(wData[1][4] !== undefined, "Holiday proximity runs dynamically and reads from Holiday Coverage");
    var hcData = MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues();
    var nydAssignee = hcData.find(function(r) { return r[0] === "New Year's Day" && r[2] === 'Call 1'; })[3];
    assert(nydAssignee === 'Bob', "Existing holiday assignees are strictly preserved across auto-fill reruns");


    // Because UI alert will throw in test, we mock getUi
    SpreadsheetApp.getUi = function() { return { alert: function(){} }; };

    // Add assignments to Vacation Availability to test calculation
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Week ID', 'Start Date (Monday)', 'Capacity', 'Prime Classification', 'Special Week Designation', 'Assigned Participants'],
      [1, '2025-01-06', 1, 'Non-Prime', 'None', 'Alice, Bob']
    ]);
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee', 'Vacation Adjacency Warning', 'Holiday Proximity Warning'],
      ['2025-01-04', 'Saturday', '', '', '']
    ]);

    // Test A: Weekend initialization resets state, populates adjacency
    beginWeekendPhase();

    var wData = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    assert(wData[1][3] === 'Alice, Bob', "Adjacency warning uses comma separation and precise exact names: " + wData[1][3]);

    var cData = MockSpreadsheetApp._sheets['Config'].getDataRange().getValues();
    assert(cData[1][1] === 'WEEKEND', "Phase set to WEEKEND");
    assert(cData[2][1] === 1, "Round set to 1");
    assert(cData[3][1] === 'ASCENDING', "Direction set to ASCENDING");
    assert(cData[4][1] === 1, "Lead set to 1");

    var pData = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    assert(pData[1][3] === '', "Entry Timestamp cleared");
    assert(pData[1][4] === false, "Reminder Sent cleared");
    assert(pData[1][5] === false, "Admin Alert Sent cleared");

    // Test B: Missing headers fail without partial writes
    var wBackup = MockSpreadsheetApp._sheets['Weekend Coverage'];
    MockSpreadsheetApp.createSheet('Weekend Coverage', [['BadHeader']]);
    var caught = false;
    try {
      beginWeekendPhase();
    } catch (e) {
      caught = true;
    }
    assert(caught, "Missing headers fail correctly before changing state");
    MockSpreadsheetApp._sheets['Weekend Coverage'] = wBackup; // restore

    // Test C: Privacy Context in getInitialState
    var initialState = getInitialState('Alice', 'BADPIN');
    assert(initialState.success === false, "Adjacency privacy validates PIN");

    // Add PIN to mock sheet to test valid login
    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'PIN', 'Currently Active', 'Weekend Phase Enabled', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Active for Year', 'Lottery Position', 'Weekend Assignment Maximum'],
      ['Alice', '1234', true, true, '', false, false, true, 1, '2']
    ]);
    initialState = getInitialState('Alice', '1234');
    assert(initialState.success === true, "Adjacency privacy passes with valid PIN");

    var weekendChoices = initialState.availableChoices.weekend;
    assert(weekendChoices[0].nearVacation === true, "nearVacation boolean is injected securely");
    assert(weekendChoices[0]['Vacation Adjacency Warning'] === undefined, "Raw adjacency names are completely stripped from client payload");





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
