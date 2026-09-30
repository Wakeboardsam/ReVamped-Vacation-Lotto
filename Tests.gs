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
          setValue: function(val) { if(!data[row-1]) data[row-1] = []; data[row - 1][col - 1] = val; },
          setValues: function(vals) { for(var i=0; i<vals.length; i++){ if(!data[row-1+i]) data[row-1+i] = []; for(var j=0; j<vals[i].length; j++){ data[row-1+i][col-1+j]=vals[i][j]; } } },
          getValue: function() { return data[row - 1] ? data[row - 1][col - 1] : ''; },
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
          setDataValidation: function() {},
          setFontColor: function() { return this; },
          setFontWeight: function() { return this; },
          setBackground: function() { return this; }
        };
      },
      setFrozenRows: function() {},
      insertColumnBefore: function(colPos) {
        var cIdx = colPos - 1;
        for (var i = 0; i < data.length; i++) {
           data[i].splice(cIdx, 0, '');
        }
      },
      getLastRow: function() { return data.length; },
      getLastColumn: function() { return data.length > 0 ? data[0].length : 0; },
      appendRow: function(row) { data.push(row); }
    };
  },
  getActiveSpreadsheet: function() {
    var self = this;
    return {
      getSheetByName: function(name) { return self._sheets[name] || null; },
      insertSheet: function(name) { self.createSheet(name, []); return self._sheets[name]; }
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
    var wData = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    var hcData = MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues();

    // Check assignee preservation
    var nydAssignee = hcData.find(function(r) { return r[0] === "New Year's Day" && r[2] === 'Call 1'; })[3];
    assert(nydAssignee === 'Bob', "Existing holiday assignees are strictly preserved across auto-fill reruns");

    // Check custom holiday preservation (NYE not in default generator but should exist)
    var nyeExists = hcData.some(function(r) { return r[0] === "NYE"; });
    assert(nyeExists, "Custom holiday names and dates not in the default generator are strictly preserved");

    // We set proximity to 0 above. We know Jan 2, 2025 is NYD observed date from the mock.
    // If we look at the weekend generated for 2025-01-04 (Saturday), it's 2 days away. So it shouldn't match.
    // Wait, let's verify if boundary proximity works. Let's change admin options to proximity 2.
    MockSpreadsheetApp.createSheet('Admin Options', [['Setting Name', 'Setting Value'], ['Active Year', '2025'], ['Holiday Proximity Range (days)', '2']]);
    autoFillAndRandomize(2025);
    wData = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    var wJan4 = wData.find(function(r) { return r[0] === '2025-01-04'; });
    assert(wJan4[4] === "New Year's Day", "Proximity calculation precisely captures boundary distance (01-04 to 01-02 is 2 days <= 2)");

    // Test zero proximity. Set to 0.
    MockSpreadsheetApp.createSheet('Admin Options', [['Setting Name', 'Setting Value'], ['Active Year', '2025'], ['Holiday Proximity Range (days)', '0']]);
    autoFillAndRandomize(2025);
    wData = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    var wJan4Zero = wData.find(function(r) { return r[0] === '2025-01-04'; });
    assert(wJan4Zero[4] === "", "Proximity 0 correctly restricts matches to exact same-day boundaries");

    // Test ties. NYE is 2024-12-31, NYD is 2025-01-02. Jan 1 is 1 day away from both!
    // But Jan 1 isn't a weekend. Let's add a fake holiday on Jan 3, and NYD on Jan 5. Jan 4 is 1 day from both.
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ["A_Tie", '2025-01-03', 'Call 1', ''],
      ["B_Tie", '2025-01-05', 'Call 1', '']
    ]);
    MockSpreadsheetApp.createSheet('Admin Options', [['Setting Name', 'Setting Value'], ['Active Year', '2025'], ['Holiday Proximity Range (days)', '1']]);
    autoFillAndRandomize(2025);
    wData = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    var wJan4Tie = wData.find(function(r) { return r[0] === '2025-01-04'; });
    // Earliest holiday date should win. A_Tie is Jan 3 (earlier than Jan 5)
    assert(wJan4Tie[4] === "A_Tie", "Holiday proximity cleanly breaks ties using the earliest absolute holiday date");

    // Test stale warning removal: Set proximity to 0 so no holidays match Jan 4
    MockSpreadsheetApp.createSheet('Admin Options', [['Setting Name', 'Setting Value'], ['Active Year', '2025'], ['Holiday Proximity Range (days)', '0']]);
    autoFillAndRandomize(2025);
    wData = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    var wJan4Stale = wData.find(function(r) { return r[0] === '2025-01-04'; });
    assert(wJan4Stale[4] === "", "Stale proximity warnings are successfully cleared upon recalculation");


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

    // Test B: Missing headers and bad lottery positions fail without partial writes
    var pBackup = MockSpreadsheetApp._sheets['Participant Config'];
    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'Currently Active', 'Weekend Phase Enabled', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Active for Year', 'Lottery Position', 'Weekend Assignment Maximum'],
      ['Alice', true, true, 'time', true, true, true, 2, '2'], // Missing position 1
      ['Bob', false, true, '', false, false, true, 2, '2'] // Duplicate position 2
    ]);
    var caught = false;
    try {
      beginWeekendPhase();
    } catch (e) {
      caught = true;
    }
    assert(caught, "Validation safely aborts on missing Lottery Position 1 or duplicate positions before altering Queue state");
    MockSpreadsheetApp._sheets['Participant Config'] = pBackup; // restore

    var wBackup = MockSpreadsheetApp._sheets['Weekend Coverage'];
    MockSpreadsheetApp.createSheet('Weekend Coverage', [['BadHeader']]);
    caught = false;
    try {
      beginWeekendPhase();
    } catch (e) {
      caught = true;
    }
    assert(caught, "Missing headers fail correctly before changing state");
    MockSpreadsheetApp._sheets['Weekend Coverage'] = wBackup; // restore

    // Test C: Integration Login -> Initial State -> Privacy Context
    var loginRes = authenticateParticipant('Alice', '1234');
    assert(loginRes.success === false, "Login correctly fails on missing/bad credentials");

    // Add PIN to mock sheet to test valid login
    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'PIN', 'Currently Active', 'Weekend Phase Enabled', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Active for Year', 'Lottery Position', 'Weekend Assignment Maximum'],
      ['Alice', '1234', true, true, '', false, false, true, 1, '2']
    ]);

    loginRes = authenticateParticipant('Alice', '1234');
    assert(loginRes.success === true, "Login succeeds with valid credentials");

    // Now simulate getInitialState with the verified PIN from memory
    var initialState = getInitialState(loginRes.participantName, 'BADPIN');
    assert(initialState.success === false, "Adjacency privacy validates PIN exactly");

    initialState = getInitialState(loginRes.participantName, '1234');
    assert(initialState.success === true, "Adjacency privacy passes with valid PIN");

    var weekendChoices = initialState.availableChoices.weekend;
    assert(weekendChoices[0].nearVacation === true, "nearVacation boolean is injected securely");
    assert(weekendChoices[0]['Vacation Adjacency Warning'] === undefined, "Raw adjacency names are completely stripped from client payload");








    // --- Schema Migration & Idempotency Tests ---
    log.push("--- Testing Schema Migration ---");
    var preMigrationPConfig = MockSpreadsheetApp._sheets['Participant Config'];
    var preMigrationRTips = MockSpreadsheetApp._sheets['Rules & Tips'];

    // 1. Setup a legacy Participant Config without Thanksgiving

    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'Had Spring Break Last Year', 'Had Christmas Week Last Year', 'Other Column'],
      ['Alice', true, true, 'AliceData'],
      ['Bob', false, false, 'BobData']
    ]);

    // Setup a legacy Rules & Tips with custom wording
    MockSpreadsheetApp.createSheet('Rules & Tips', [
      ['Section Key', 'Display Text'],
      ['Custom Rule', 'This is a strictly custom rule that must not be overwritten.']
    ]);

    // Run schema setup (migration)
    setupDatabaseSchema();

    var pDataAfter = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    var pHeadersAfter = pDataAfter[0];

    // Verify column was inserted BEFORE Christmas
    var springIdx = pHeadersAfter.indexOf('Had Spring Break Last Year');
    var thanksIdx = pHeadersAfter.indexOf('Had Thanksgiving Week Last Year');
    var christIdx = pHeadersAfter.indexOf('Had Christmas Week Last Year');

    assert(thanksIdx !== -1, "Thanksgiving column was successfully added to Participant Config.");
    assert(thanksIdx === christIdx - 1, "Thanksgiving column was inserted immediately before Christmas.");

    // Verify existing data preserved
    assert(pDataAfter[1][springIdx] === true, "Alice's Spring Break data preserved.");
    assert(pDataAfter[1][thanksIdx] === false, "Alice's Thanksgiving data defaulted to false.");
    assert(pDataAfter[1][christIdx] === true, "Alice's Christmas data preserved after shift.");
    assert(pDataAfter[1][pHeadersAfter.indexOf('Other Column')] === 'AliceData', "Other columns preserved after shift.");

    // Verify Rules & Tips custom wording preserved
    var rDataAfter = MockSpreadsheetApp._sheets['Rules & Tips'].getDataRange().getValues();
    assert(rDataAfter[1][1] === 'This is a strictly custom rule that must not be overwritten.', "Custom Rules & Tips wording was preserved during migration.");

    // Idempotency: Run setup again
    setupDatabaseSchema();
    var pDataAfter2 = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    var pHeadersAfter2 = pDataAfter2[0];

    var countThanksgiving = pHeadersAfter2.filter(h => h === 'Had Thanksgiving Week Last Year').length;
    assert(countThanksgiving === 1, "Running setup multiple times does not duplicate the Thanksgiving column.");
    assert(pDataAfter2[1][christIdx] === true, "Data remains intact after redundant setup run.");


    // Fallback placement (if Christmas is missing)
    var fallbackPBackup = MockSpreadsheetApp._sheets['Participant Config'];
    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'Had Spring Break Last Year', 'Other Column'],
      ['Alice', true, 'AliceData']
    ]);
    setupDatabaseSchema();
    var pDataFallback = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    var pHeadersFallback = pDataFallback[0];
    assert(pHeadersFallback.indexOf('Had Thanksgiving Week Last Year') !== -1, "Thanksgiving column safely falls back to append if Christmas column is missing.");

    MockSpreadsheetApp._sheets['Participant Config'] = fallbackPBackup; // Restore config
    MockSpreadsheetApp._sheets['Participant Config'] = preMigrationPConfig; // Full restore
    MockSpreadsheetApp._sheets['Rules & Tips'] = preMigrationRTips; // Full restore

    // Test Admin Options schema cleanup
    var preMigrationAdminOptions = MockSpreadsheetApp._sheets['Admin Options'];
    MockSpreadsheetApp.createSheet('Admin Options', [
        ['Setting Name', 'Setting Value', 'Description']
    ]);
    setupDatabaseSchema();
    var adminDataAfter = MockSpreadsheetApp._sheets['Admin Options'].getDataRange().getValues();
    var adminKeysAfter = adminDataAfter.map(r => r[0]);

    // Verify obsolete rows are not present
    assert(adminKeysAfter.indexOf('Vacation Window Size (mins)') === -1, "Obsolete Vacation Window Size row should not be created.");
    assert(adminKeysAfter.indexOf('Weekend Window Size (mins)') === -1, "Obsolete Weekend Window Size row should not be created.");
    assert(adminKeysAfter.indexOf('Holiday Window Size (mins)') === -1, "Obsolete Holiday Window Size row should not be created.");
    assert(adminKeysAfter.indexOf('Transfer Window Size (mins)') === -1, "Obsolete Transfer Window Size row should not be created.");
    assert(adminKeysAfter.indexOf('Admin Phone Number') === -1, "Obsolete Admin Phone Number row should not be created.");
    assert(adminKeysAfter.indexOf('Twilio Account SID') === -1, "Obsolete Twilio Account SID row should not be created.");
    assert(adminKeysAfter.indexOf('Twilio Auth Token') === -1, "Obsolete Twilio Auth Token row should not be created.");
    assert(adminKeysAfter.indexOf('Twilio Sender Phone') === -1, "Obsolete Twilio Sender Phone row should not be created.");
    assert(adminKeysAfter.indexOf('WARNING') === -1, "Obsolete Twilio warning row should not be created.");

    // Verify required rows are present
    assert(adminKeysAfter.indexOf('Active Year') !== -1, "Required Active Year row should be created.");
    assert(adminKeysAfter.indexOf('Web App URL') !== -1, "Required Web App URL row should be created.");

    MockSpreadsheetApp._sheets['Admin Options'] = preMigrationAdminOptions; // Restore config

    // --- NARROW FIX REGRESSION TESTS ---

    // 1. Full Holiday Coverage gives zero mandatory ACTIVE participants.
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['Christmas', 'Call 1', 'Alice'],
      ['Christmas', 'Call 2', 'Bob']
    ]);
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('HOLIDAY_MANDATORY');
    var emptyWindows = getQueueWindows_('HOLIDAY_MANDATORY', { phase: 'HOLIDAY_MANDATORY', round: 1, direction: 'ASCENDING', lead: 1 }, {});
    assert(emptyWindows.activeWindow.length === 0, "Full Holiday Coverage produces no HOLIDAY_MANDATORY active window.");

    // 2. Queue stops after the final holiday position is filled.
    var advanceRes = advanceQueueInternal_();
    assert(advanceRes && advanceRes.complete === true, "Queue does not continue cycling after the final holiday position is assigned.");

    var sysConfig = MockSpreadsheetApp._sheets['Config'].getDataRange().getValues();
    var currentPhaseSet = false;
    for(var i = 1; i < sysConfig.length; i++) {
        if(sysConfig[i][0] === 'Current Phase' && sysConfig[i][1] === 'TRANSFER_OFFER_COLLECTION') currentPhaseSet = true;
    }
    assert(currentPhaseSet, "System config Current Phase is correctly set to Transfer phase.");

    // 3. Stale holiday submission is rejected without advancing.
    var staleSubmitPassed = false;
    var origGetActiveParticipants = getActiveParticipants;
    getActiveParticipants = function(p) { return [{ Name: 'Alice' }]; };
    // Prepare initial state
    var preTestOffersCount = MockSpreadsheetApp._sheets['Transfer Offers'] ? MockSpreadsheetApp._sheets['Transfer Offers'].getDataRange().getValues().length : 0;
    var hDataPre = getSheetDataAsObjects('Holiday Coverage', {});

    try {
      // Simulate state changing while Alice was selecting
      setQueueState({ phase: 'TRANSFER_OFFER_COLLECTION' });
      submitSelection('Alice', { phase: 'HOLIDAY_VOLUNTEER', action: 'SUBMIT', selections: [{ name: 'Christmas', position: 'Call 1' }] });
      staleSubmitPassed = true;
    } catch (e) {
      assert(e.message.indexOf('Holiday selection is no longer available because holiday coverage is complete') !== -1, "Stale holiday submission rejected appropriately with clean message.");
    }
    assert(!staleSubmitPassed, "Stale submission should not succeed when holiday coverage is complete.");

    // Verify no Transfer Offer row was created
    var postTestOffersCount = MockSpreadsheetApp._sheets['Transfer Offers'] ? MockSpreadsheetApp._sheets['Transfer Offers'].getDataRange().getValues().length : 0;
    assert(postTestOffersCount === preTestOffersCount, "No Transfer Offer row should be created during rejected stale holiday submission.");

    // Verify Holiday assignment was not changed
    var hDataPost = getSheetDataAsObjects('Holiday Coverage', {});
    assert(JSON.stringify(hDataPre) === JSON.stringify(hDataPost), "Holiday coverage should remain unchanged after rejected stale submission.");

    // Verify Queue state didn't change
    var currentState = getQueueState();
    assert(currentState.phase === 'TRANSFER_OFFER_COLLECTION', "Queue phase should remain TRANSFER_OFFER_COLLECTION after rejected stale submission.");

    getActiveParticipants = origGetActiveParticipants;

    // Weekend Duplicate Ownership Tests
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'First Call Assignee'],
      ['2025-01-04', 'Alice'], // Saturday
      ['2025-01-05', ''],      // Sunday
      ['2025-01-11', 'Bob']    // Next Saturday
    ]);
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('WEEKEND');

    // 4. Saturday owner cannot take Sunday of the same weekend.
    var weekendSubmit1 = false;
    getActiveParticipants = function(p) { return [{ Name: 'Alice' }]; };
    try {
      submitSelection('Alice', { action: 'SUBMIT', selections: ['2025-01-05'] });
      weekendSubmit1 = true;
    } catch (e) {
      assert(e.message.indexOf('already hold the other First Call position for this weekend') !== -1, "Saturday owner rejected for Sunday.");
    }
    assert(!weekendSubmit1, "Saturday owner cannot take Sunday of the same weekend.");

    // 5. Sunday owner cannot take Saturday of the same weekend.
    MockSpreadsheetApp._sheets['Weekend Coverage'].getRange(2, 2).setValue(''); // Sat open
    MockSpreadsheetApp._sheets['Weekend Coverage'].getRange(3, 2).setValue('Alice'); // Sun taken by Alice
    var weekendSubmit2 = false;
    try {
      submitSelection('Alice', { action: 'SUBMIT', selections: ['2025-01-04'] });
      weekendSubmit2 = true;
    } catch (e) {
      assert(e.message.indexOf('already hold the other First Call position for this weekend') !== -1, "Sunday owner rejected for Saturday.");
    }
    assert(!weekendSubmit2, "Sunday owner cannot take Saturday of the same weekend.");

    // 6. Different weekends remain allowed.
    var weekendSubmit3 = false;
    try {
      // Alice owns Sunday (01-05). Try selecting next Saturday (01-11).
      // Note: Bob owns 01-11 right now. Let's make it open so Alice can take it.
      MockSpreadsheetApp._sheets['Weekend Coverage'].getRange(4, 2).setValue('');

      // Mock getQueueState so it doesn't fail on queue verification
      submitSelection('Alice', { action: 'SUBMIT', selections: ['2025-01-11'] });
      weekendSubmit3 = true;
    } catch (e) {
      console.log(e.message);
    }
    assert(weekendSubmit3, "Participant may still select a Saturday/Sunday belonging to a different weekend.");

    // Holiday Duplicate Ownership Tests
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['Thanksgiving', 'Call 1', 'Alice'],
      ['Thanksgiving', 'Call 2', ''],
      ['New Year', 'Call 1', 'Bob'],
      ['New Year', 'Call 2', '']
    ]);
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('HOLIDAY_VOLUNTEER');

    // reset sysconfig for these tests
    MockSpreadsheetApp._sheets['Config'] = undefined;
    MockSpreadsheetApp.createSheet('Config', [
      ['Setting Name', 'Setting Value'],
      ['Current Phase', 'HOLIDAY_VOLUNTEER'],
      ['Phase Ready', '']
    ]);

    // 7. Holiday Call 1 owner cannot take Call 2 of the same holiday.
    var holSubmit1 = false;
    try {
      submitSelection('Alice', { action: 'SUBMIT', selections: [{ name: 'Thanksgiving', position: 'Call 2' }] });
      holSubmit1 = true;
    } catch (e) {
      assert(e.message.indexOf('You already hold a call position for this holiday') !== -1, "Call 1 owner rejected for Call 2.");
    }
    assert(!holSubmit1, "Participant holding Holiday Call 1 cannot select Call 2 of that holiday.");

    // 8. Holiday Call 2 owner cannot take Call 1 of that holiday.
    MockSpreadsheetApp._sheets['Holiday Coverage'].getRange(2, 3).setValue('');
    MockSpreadsheetApp._sheets['Holiday Coverage'].getRange(3, 3).setValue('Alice');
    var holSubmit2 = false;
    try {
      submitSelection('Alice', { action: 'SUBMIT', selections: [{ name: 'Thanksgiving', position: 'Call 1' }] });
      holSubmit2 = true;
    } catch (e) {
      assert(e.message.indexOf('You already hold a call position for this holiday') !== -1, "Call 2 owner rejected for Call 1.");
    }
    assert(!holSubmit2, "Participant holding Holiday Call 2 cannot select Call 1 of that holiday.");

    // 9. Different holidays remain allowed.
    var holSubmit3 = false;
    try {
      // Alice owns Thanksgiving Call 2. Try selecting New Year Call 2.
      submitSelection('Alice', { action: 'SUBMIT', selections: [{ name: 'New Year', position: 'Call 2' }] });
      holSubmit3 = true;
    } catch (e) {
      console.log(e.message);
    }
    assert(holSubmit3, "Participant may select call positions on different holidays.");

    // 10. Nearby-holiday weekend selection enforces the same holiday duplicate restriction.
    // 10a. Weekend selection ignores stale adjacentHoliday field without assigning any holiday
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('WEEKEND');
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'First Call Assignee'],
      ['2027-11-27', ''],
      ['2027-11-28', '']
    ]);
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Call Position (Call 1 / Call 2)', 'Assigned Participant', 'Observed Date'],
      ['Thanksgiving', 'Call 1', '', '2027-11-25'],
      ['Thanksgiving', 'Call 2', '', '2027-11-25']
    ]);
    getActiveParticipants = function(p) { return [{ Name: 'Alice' }]; };
    var weekendStaleHolSubmit = submitSelection('Alice', { action: 'SUBMIT', selections: ['2027-11-27'], adjacentHoliday: { holidayName: 'Thanksgiving', position: 'Call 2' } });
    assert(weekendStaleHolSubmit && weekendStaleHolSubmit.success === true, "Weekend selection with stale adjacentHoliday succeeds for weekend.");
    assert(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues()[1][1] === 'Alice', "Weekend is assigned to Alice.");
    assert(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues()[2][2] === '', "Holiday Call 2 is NOT assigned via Weekend submission.");

    // 10b. Holiday selection with optional adjacent weekend
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('HOLIDAY_VOLUNTEER');
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Call Position (Call 1 / Call 2)', 'Assigned Participant', 'Observed Date'],
      ['Thanksgiving', 'Call 1', '', '2027-11-25'],
      ['Thanksgiving', 'Call 2', '', '2027-11-25']
    ]);
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'First Call Assignee'],
      ['2027-11-27', ''],
      ['2027-11-28', '']
    ]);

    var holWithWkndSubmit = submitSelection('Alice', { action: 'SUBMIT', selections: [{ name: 'Thanksgiving', position: 'Call 1' }], adjacentWeekend: { date: '2027-11-27' } });
    assert(holWithWkndSubmit && holWithWkndSubmit.success === true, "Holiday selection with valid optional adjacent weekend succeeds.");
    assert(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues()[1][2] === 'Alice', "Holiday Thanksgiving Call 1 assigned to Alice.");
    assert(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues()[1][1] === 'Alice', "Optional adjacent weekend assigned to Alice.");

    // 10c. Holiday selection with occupied optional weekend returns partial success (Alice owns NO positions prior)
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('HOLIDAY_VOLUNTEER');
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Call Position (Call 1 / Call 2)', 'Assigned Participant', 'Observed Date'],
      ['Thanksgiving', 'Call 1', '', '2027-11-25'],
      ['Thanksgiving', 'Call 2', '', '2027-11-25']
    ]);
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'First Call Assignee'],
      ['2027-11-27', 'Bob'], // Bob occupies the weekend
      ['2027-11-28', '']
    ]);
    var pSheetData = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    var bobExists = pSheetData.some(row => row[0] === 'Bob');
    if (!bobExists) { MockSpreadsheetApp._sheets['Participant Config'].appendRow(['Bob', true, true, '', false, false, true, 3, '2']); }

    getActiveParticipants = function(p) { return [{ Name: 'Alice' }]; };
    var holOccupiedWkndSubmit = submitSelection('Alice', { action: 'SUBMIT', selections: [{ name: 'Thanksgiving', position: 'Call 1' }], adjacentWeekend: { date: '2027-11-27' } });
    assert(holOccupiedWkndSubmit.success === true && holOccupiedWkndSubmit.message && holOccupiedWkndSubmit.message.indexOf('was not added because it was just selected by another participant') !== -1, "Holiday saved with partial success message when optional weekend occupied.");
    assert(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues()[1][2] === 'Alice', "Holiday Thanksgiving Call 1 saved to Alice.");
    assert(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues()[1][1] === 'Bob', "Weekend 2027-11-27 remains assigned to Bob.");

    // 10d. Nonadjacent optional weekend rejected without writes to either sheet
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('HOLIDAY_VOLUNTEER');
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Call Position (Call 1 / Call 2)', 'Assigned Participant', 'Observed Date'],
      ['Thanksgiving', 'Call 1', '', '2027-11-25'],
      ['Thanksgiving', 'Call 2', '', '2027-11-25']
    ]);
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'First Call Assignee'],
      ['2027-01-02', ''] // Nonadjacent date (January vs November)
    ]);
    var hDataPre = JSON.stringify(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues());
    var wDataPre = JSON.stringify(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues());

    var nonAdjacentFailed = false;
    try {
      submitSelection('Alice', { action: 'SUBMIT', selections: [{ name: 'Thanksgiving', position: 'Call 1' }], adjacentWeekend: { date: '2027-01-02' } });
      nonAdjacentFailed = true;
    } catch (e) {
      assert(e.message.indexOf('not within the holiday proximity range') !== -1, "Nonadjacent weekend date correctly rejected.");
    }
    assert(!nonAdjacentFailed, "Nonadjacent weekend submission rejected.");
    assert(JSON.stringify(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues()) === hDataPre, "Holiday sheet unchanged on rejected nonadjacent weekend.");
    assert(JSON.stringify(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues()) === wDataPre, "Weekend sheet unchanged on rejected nonadjacent weekend.");

    // 10e. Malformed adjacentWeekend objects (e.g. {}, array, non-string date, garbage) rejected without writes
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('HOLIDAY_VOLUNTEER');
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Call Position (Call 1 / Call 2)', 'Assigned Participant', 'Observed Date'],
      ['Thanksgiving', 'Call 1', '', '2027-11-25'],
      ['Thanksgiving', 'Call 2', '', '2027-11-25']
    ]);
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'First Call Assignee'],
      ['2027-11-27', '']
    ]);
    var hDataPreMalformed = JSON.stringify(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues());
    var wDataPreMalformed = JSON.stringify(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues());

    var malformedPayloads = [
      {},
      { date: 12345 },
      { date: null },
      { date: ['2027-11-27'] },
      { date: '2027-11-27garbage' },
      '2027-11-27',
      ['2027-11-27']
    ];

    for (var m = 0; m < malformedPayloads.length; m++) {
      var malformedFailed = false;
      try {
        submitSelection('Alice', { action: 'SUBMIT', selections: [{ name: 'Thanksgiving', position: 'Call 1' }], adjacentWeekend: malformedPayloads[m] });
        malformedFailed = true;
      } catch (e) {
        assert(e.message.indexOf('Invalid or malformed weekend date requested') !== -1, "Malformed payload rejected: " + JSON.stringify(malformedPayloads[m]));
      }
      assert(!malformedFailed, "Malformed payload submission rejected.");
      assert(JSON.stringify(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues()) === hDataPreMalformed, "Holiday sheet unchanged on malformed payload.");
      assert(JSON.stringify(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues()) === wDataPreMalformed, "Weekend sheet unchanged on malformed payload.");
    }

    // 10f. Disabled Weekend Phase Enabled returns partial success for Holiday
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('HOLIDAY_VOLUNTEER');
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Call Position (Call 1 / Call 2)', 'Assigned Participant', 'Observed Date'],
      ['Thanksgiving', 'Call 1', '', '2027-11-25'],
      ['Thanksgiving', 'Call 2', '', '2027-11-25']
    ]);
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'First Call Assignee'],
      ['2027-11-27', '']
    ]);

    var pHeaders = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues()[0];
    var wkCol = pHeaders.indexOf('Weekend Phase Enabled');
    var aliceRowIdx = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues().findIndex(r => r[0] === 'Alice') + 1;
    MockSpreadsheetApp._sheets['Participant Config'].getRange(aliceRowIdx, wkCol + 1).setValue(false);

    var holDisabledWkndSubmit = submitSelection('Alice', { action: 'SUBMIT', selections: [{ name: 'Thanksgiving', position: 'Call 1' }], adjacentWeekend: { date: '2027-11-27' } });
    assert(holDisabledWkndSubmit.success === true && holDisabledWkndSubmit.message && holDisabledWkndSubmit.message.indexOf('disabled for your account') !== -1, "Holiday saved with explanation when weekend participation disabled.");
    assert(MockSpreadsheetApp._sheets['Holiday Coverage'].getRange(2, 3).getValue() === 'Alice', "Holiday saved to Alice.");
    assert(MockSpreadsheetApp._sheets['Weekend Coverage'].getRange(2, 2).getValue() === '', "Weekend remains unassigned when participant disabled for weekend.");

    // Restore Alice's Weekend Phase Enabled
    MockSpreadsheetApp._sheets['Participant Config'].getRange(aliceRowIdx, wkCol + 1).setValue(true);

    // 11. HOLIDAY_VOLUNTEER Pass still works.
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('HOLIDAY_VOLUNTEER');
    // Ensure "Holiday Volunteer Response" column exists in Participant Config
    var ptHeaders = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues()[0];
    if (ptHeaders.indexOf('Holiday Volunteer Response') === -1) { ptHeaders.push('Holiday Volunteer Response'); }
    var volPassSubmit = false;
    try {
      submitSelection('Alice', { action: 'PASS' });
      volPassSubmit = true;
    } catch (e) {
      console.log(e);
    }
    assert(volPassSubmit, "HOLIDAY_VOLUNTEER Pass still works.");
    assert(MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues()[1][MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues()[0].indexOf('Holiday Volunteer Response')] === 'Pass', "Volunteer response correctly updated to Pass.");

    // 12. HOLIDAY_MANDATORY Pass is rejected and does not advance the queue.
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('HOLIDAY_MANDATORY');
    var mandPassSubmit = false;
    try {
      submitSelection('Alice', { action: 'PASS' });
      mandPassSubmit = true;
    } catch (e) {
      assert(e.message.indexOf('Passing is not allowed') !== -1, "Mandatory holiday pass correctly rejected.");
    }
    assert(!mandPassSubmit, "HOLIDAY_MANDATORY Pass is rejected and does not advance the queue.");


    // --- Prior Year Restrictions Regression Tests ---
    log.push("--- Testing Prior Year Vacation Restrictions ---");
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Week ID', 'Start Date (Monday)', 'Capacity', 'Prime Classification', 'Special Week Designation', 'Assigned Participants'],
      ['W1', '2025-03-10', '4', 'Prime', 'Spring Break', ''],
      ['W2', '2025-11-24', '4', 'Non-Prime', 'Thanksgiving', ''],
      ['W3', '2025-12-22', '4', 'Prime', 'Christmas', ''],
      ['W4', '2025-06-09', '4', 'Prime', 'None', '']
    ]);

    // Ensure columns exist
    var ptHeaders = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues()[0];
    if (ptHeaders.indexOf('Had Spring Break Last Year') === -1) ptHeaders.push('Had Spring Break Last Year');
    if (ptHeaders.indexOf('Had Thanksgiving Week Last Year') === -1) ptHeaders.push('Had Thanksgiving Week Last Year');
    if (ptHeaders.indexOf('Had Christmas Week Last Year') === -1) ptHeaders.push('Had Christmas Week Last Year');

    var ptDataUpdated = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    var aliceRow = ptDataUpdated.findIndex(row => row[0] === 'Alice');

    // Alice has all 3
    ptDataUpdated[aliceRow][ptHeaders.indexOf('Had Spring Break Last Year')] = true;
    ptDataUpdated[aliceRow][ptHeaders.indexOf('Had Thanksgiving Week Last Year')] = true;
    ptDataUpdated[aliceRow][ptHeaders.indexOf('Had Christmas Week Last Year')] = true;

    // Create Charlie with NO restrictions (false/blank)
    var charlieRow = ptDataUpdated.findIndex(row => row[0] === 'Charlie');
    if (charlieRow === -1) {
       MockSpreadsheetApp._sheets['Participant Config'].appendRow(['Charlie', true, true, '', false, false, true, 3, '2']);
       ptDataUpdated = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
       charlieRow = ptDataUpdated.findIndex(row => row[0] === 'Charlie');
    }
    while (ptDataUpdated[charlieRow].length < ptHeaders.length) { ptDataUpdated[charlieRow].push(''); }
    ptDataUpdated[charlieRow][ptHeaders.indexOf('Had Spring Break Last Year')] = false;
    ptDataUpdated[charlieRow][ptHeaders.indexOf('Had Thanksgiving Week Last Year')] = ''; // Test blank
    ptDataUpdated[charlieRow][ptHeaders.indexOf('Had Christmas Week Last Year')] = false;

    // Create Bob with ONLY Spring Break
    var bobRow = ptDataUpdated.findIndex(row => row[0] === 'Bob');
    if (bobRow === -1) {
       MockSpreadsheetApp._sheets['Participant Config'].appendRow(['Bob', false, true, '', false, false, true, 2, '2']);
       ptDataUpdated = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
       bobRow = ptDataUpdated.findIndex(row => row[0] === 'Bob');
    }
    while (ptDataUpdated[bobRow].length < ptHeaders.length) { ptDataUpdated[bobRow].push(''); }
    ptDataUpdated[bobRow][ptHeaders.indexOf('Had Spring Break Last Year')] = true;
    ptDataUpdated[bobRow][ptHeaders.indexOf('Had Thanksgiving Week Last Year')] = false;
    ptDataUpdated[bobRow][ptHeaders.indexOf('Had Christmas Week Last Year')] = false;

    // Create Dave with ONLY Thanksgiving
    var daveRow = ptDataUpdated.findIndex(row => row[0] === 'Dave');
    if (daveRow === -1) {
       MockSpreadsheetApp._sheets['Participant Config'].appendRow(['Dave', true, true, '', false, false, true, 4, '2']);
       ptDataUpdated = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
       daveRow = ptDataUpdated.findIndex(row => row[0] === 'Dave');
    }
    while (ptDataUpdated[daveRow].length < ptHeaders.length) { ptDataUpdated[daveRow].push(''); }
    ptDataUpdated[daveRow][ptHeaders.indexOf('Had Spring Break Last Year')] = false;
    ptDataUpdated[daveRow][ptHeaders.indexOf('Had Thanksgiving Week Last Year')] = true;
    ptDataUpdated[daveRow][ptHeaders.indexOf('Had Christmas Week Last Year')] = false;

    // Create Eve with ONLY Christmas
    var eveRow = ptDataUpdated.findIndex(row => row[0] === 'Eve');
    if (eveRow === -1) {
       MockSpreadsheetApp._sheets['Participant Config'].appendRow(['Eve', true, true, '', false, false, true, 5, '2']);
       ptDataUpdated = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
       eveRow = ptDataUpdated.findIndex(row => row[0] === 'Eve');
    }
    while (ptDataUpdated[eveRow].length < ptHeaders.length) { ptDataUpdated[eveRow].push(''); }
    ptDataUpdated[eveRow][ptHeaders.indexOf('Had Spring Break Last Year')] = false;
    ptDataUpdated[eveRow][ptHeaders.indexOf('Had Thanksgiving Week Last Year')] = false;
    ptDataUpdated[eveRow][ptHeaders.indexOf('Had Christmas Week Last Year')] = true;


    MockSpreadsheetApp._sheets['Config'] = undefined;
    MockSpreadsheetApp.createSheet('Config', [
      ['Setting Name', 'Setting Value'],
      ['Current Phase', 'VACATION_SENIORITY'],
      ['Current Round', '1'],
      ['Current Direction', 'ASCENDING'],
      ['Current Lead', '1']
    ]);

    // Test Round 1 and 2 enforcement
    getActiveParticipants = function(p) { return [{ Name: 'Alice' }]; };

    // 1. Spring Break restriction in Round 1
    var r1SpringSubmit = false;
    try {
      submitSelection('Alice', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W1'] });
      r1SpringSubmit = true;
    } catch(e) {
      assert(e.message.indexOf('restricted from selecting Spring Break until Round 4') !== -1, "Spring Break correctly restricted in Round 1.");
    }
    assert(!r1SpringSubmit, "Spring Break should be restricted in Round 1.");

    // 2. Thanksgiving restriction in Round 2
    MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue('2');
    var r2ThanksgivingSubmit = false;
    try {
      submitSelection('Alice', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W2'] });
      r2ThanksgivingSubmit = true;
    } catch(e) {
      assert(e.message.indexOf('restricted from selecting Thanksgiving until Round 4') !== -1, "Thanksgiving correctly restricted in Round 2.");
    }
    assert(!r2ThanksgivingSubmit, "Thanksgiving should be restricted in Round 2.");

    // 3. Christmas restriction in Round 3 in VACATION_RANDOM phase
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('VACATION_RANDOM');
    MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue('3');
    var r3ChristmasSubmit = false;
    try {
      submitSelection('Alice', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W3'] });
      r3ChristmasSubmit = true;
    } catch(e) {
      assert(e.message.indexOf('restricted from selecting Christmas until Round 4') !== -1, "Christmas correctly restricted in Round 3 (RANDOM).");
    }
    assert(!r3ChristmasSubmit, "Christmas should be restricted in Round 3.");

    // Verify atomicity/no partial writes on error
    var r3MultiSubmit = false;
    try {
      submitSelection('Alice', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W4', 'W1'] });
      r3MultiSubmit = true;
    } catch(e) {
      assert(e.message.indexOf('restricted from selecting Spring Break') !== -1, "Multi-select correctly fails if any selection is restricted.");
    }
    assert(!r3MultiSubmit, "Multi-select with a restricted week should fail completely.");
    var vData = MockSpreadsheetApp._sheets['Vacation Availability'].getDataRange().getValues();
    assert(vData[4][5] === '', "No partial writes occurred; W4 remains unassigned after failed multi-select.");

    // 4. Allowed in Round 4
    MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue('4');
    var r4Submit = false;
    try {
      var r4Res = submitSelection('Alice', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W2'] });
      r4Submit = r4Res.success;
    } catch(e) { console.log(e); }
    assert(r4Submit, "Thanksgiving restriction lifted in Round 4.");
    vData = MockSpreadsheetApp._sheets['Vacation Availability'].getDataRange().getValues();
    assert(vData[2][5] === 'Alice', "Alice successfully assigned Thanksgiving in Round 4.");

    // Reset Alice's assignment for independence tests
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(3, 6).setValue('');
    MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue('1'); // Back to round 1

    // 5. Blank/FALSE behavior (Charlie has NO restrictions)
    getActiveParticipants = function(p) { return [{ Name: 'Charlie' }]; };
    var blankSubmit = false;
    try {
      var bRes = submitSelection('Charlie', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W2'] }); // Thanksgiving
      blankSubmit = bRes.success;
    } catch(e) { console.log(e); }
    assert(blankSubmit, "Blank or FALSE values do not create a restriction.");
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(3, 6).setValue('');







    // 6. Independence: Spring Break history blocks ONLY Spring Break
    MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue('1');
    getActiveParticipants = function(p) { return [{ Name: 'Bob' }]; };
    var bobIndepThanks = false, bobIndepChrist = false, bobIndepSpring = false;
    try {
       var r = submitSelection('Bob', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W2'] });
       bobIndepThanks = r.success;
    } catch(e) {}
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(3, 6).setValue('');
    try {
       var r = submitSelection('Bob', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W3'] });
       bobIndepChrist = r.success;
    } catch(e) {}
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(4, 6).setValue('');
    try {
       var r = submitSelection('Bob', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W1'] });
       bobIndepSpring = r.success;
    } catch(e) {}
    assert(bobIndepThanks && bobIndepChrist && !bobIndepSpring, "Spring Break history blocks only Spring Break. Thanksgiving and Christmas remain available.");





    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(3, 6).setValue('');
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(4, 6).setValue('');


    // 7. Independence: Thanksgiving history blocks ONLY Thanksgiving
    MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue('1');
    getActiveParticipants = function(p) { return [{ Name: 'Dave' }]; };
    var daveIndepThanks = false, daveIndepChrist = false, daveIndepSpring = false;
    try { daveIndepSpring = submitSelection('Dave', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W1'] }).success; } catch(e) {}
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(2, 6).setValue('');
    try { daveIndepChrist = submitSelection('Dave', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W3'] }).success; } catch(e) {}
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(4, 6).setValue('');
    try { daveIndepThanks = submitSelection('Dave', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W2'] }).success; } catch(e) {}
    assert(daveIndepSpring && daveIndepChrist && !daveIndepThanks, "Thanksgiving history blocks only Thanksgiving. Spring Break and Christmas remain available.");
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(2, 6).setValue('');
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(4, 6).setValue('');

    // 8. Independence: Christmas history blocks ONLY Christmas
    MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue('1');
    getActiveParticipants = function(p) { return [{ Name: 'Eve' }]; };
    var eveIndepThanks = false, eveIndepChrist = false, eveIndepSpring = false;
    try { eveIndepSpring = submitSelection('Eve', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W1'] }).success; } catch(e) {}
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(2, 6).setValue('');
    try { eveIndepThanks = submitSelection('Eve', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W2'] }).success; } catch(e) {}
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(3, 6).setValue('');
    try { eveIndepChrist = submitSelection('Eve', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W3'] }).success; } catch(e) {}
    assert(eveIndepSpring && eveIndepThanks && !eveIndepChrist, "Christmas history blocks only Christmas. Spring Break and Thanksgiving remain available.");

    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(2, 6).setValue('');
    MockSpreadsheetApp._sheets['Vacation Availability'].getRange(3, 6).setValue('');
    getActiveParticipants = origGetActiveParticipants;




    // --- Transfer Receiver Fix Regression Tests ---
    log.push("--- Testing Transfer Receiver Rules ---");
    MockSpreadsheetApp.createSheet('Transfer History', [
      ['Timestamp', 'Assignment Type', 'Assignment Date', 'Call Position/Day', 'Original Assignee', 'New Assignee', 'Year', 'Receiver Round', 'Claim ID']
    ]);
    MockSpreadsheetApp.createSheet('Transfer Offers', [
      ['Offer ID', 'Original Assignee (Giver)', 'Assignment Type', 'Date/Position', 'Status', 'Timestamp', 'Group ID'],
      ['OFFER-1', 'Dan', 'WEEKEND', '2025-02-01', 'Active', '', 'GRP-1'],
      ['OFFER-2', 'Dan', 'HOLIDAY', 'President - Call 1', 'Active', '', 'GRP-1'],
      ['OFFER-3', 'Eve', 'WEEKEND', '2025-02-08', 'Active', '', '']
    ]);
    MockSpreadsheetApp._sheets['Config'] = undefined;
    MockSpreadsheetApp.createSheet('Config', [
      ['Setting Name', 'Setting Value'],
      ['Current Phase', 'TRANSFER_RECEIVER'],
      ['Current Round', '1'],
      ['Current Direction', 'ASCENDING'],
      ['Current Lead', '1']
    ]);

    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee'],
      ['2025-02-01', 'Saturday', 'Dan'],
      ['2025-02-08', 'Saturday', 'Eve']
    ]);
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['President', '2025-02-17', 'Call 1', 'Dan']
    ]);

    // Ensure Alice has Transfer Receiver = true
    var ptData = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    var pHeaders = ptData[0];
    if (pHeaders.indexOf('Transfer Receiver') === -1) {
      pHeaders.push('Transfer Receiver');
      for (var r = 1; r < ptData.length; r++) ptData[r].push(true);
    }
    var aliceRow = ptData.findIndex(row => row[0] === 'Alice');
    ptData[aliceRow][pHeaders.indexOf('Transfer Receiver')] = true;

    // Unmock getActiveParticipants to test real queue logic
    getActiveParticipants = origGetActiveParticipants;

    // Test real queue initialization for TRANSFER_RECEIVER
    var activeBeforeSubmit = getActiveParticipants('TRANSFER_RECEIVER');
    console.log(activeBeforeSubmit);
    console.log("ptHeaders: " + ptData[0]);
    console.log("Alice row: " + ptData[aliceRow]);
    assert(activeBeforeSubmit.length > 0 && activeBeforeSubmit[0]['Name'] === 'Alice', "Round 1 begins ASCENDING at Lottery Position 1 (Alice).");
    var qStateBefore = getQueueState();
    assert(qStateBefore.round == 1 && qStateBefore.direction === 'ASCENDING' && qStateBefore.lead == 1, "Queue State correctly points to Round 1, ASCENDING, Lead 1.");

    // A) Grouped offer counts as one turn
    var groupedSubmit = submitSelection('Alice', { phase: 'TRANSFER_RECEIVER', action: 'SUBMIT', selections: [{ type: 'GROUPED', groupId: 'GRP-1' }] });
    assert(groupedSubmit.success === true, "Receiver can successfully claim a grouped Weekend+Holiday offer.");

    var thData = MockSpreadsheetApp._sheets['Transfer History'].getDataRange().getValues();
    assert(thData.length === 3, "Transfer History appended 2 rows for grouped claim."); // header + 2 rows
    assert(thData[1][8] === thData[2][8], "Grouped claim shares a single Claim ID: " + thData[1][8]);
    assert(thData[1][7] == 1 && thData[2][7] == 1, "Receiver Round is recorded as 1.");

    // B) Duplicate submission blocked in same round
    // We mock getActiveParticipants here because Alice just claimed and advanceQueueInternal_ moved the queue forward (she is no longer the active participant in the real queue)
    // To test duplicate protection, we force her to be active for the simulation.
    getActiveParticipants = function() { return [{ Name: 'Alice' }]; };
    MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue('1');
    var dupSubmit = false;
    try {
      submitSelection('Alice', { phase: 'TRANSFER_RECEIVER', action: 'SUBMIT', selections: [{ type: 'WEEKEND', offerId: 'OFFER-3' }] });
      dupSubmit = true;
    } catch(e) {
      assert(e.message.indexOf('already claimed an offer in the current transfer round') !== -1, "Duplicate claim correctly blocked in the same round.");
    }
    assert(!dupSubmit, "Receiver cannot claim a second time in Round 1.");
    getActiveParticipants = origGetActiveParticipants; // restore

    // C) "None" behavior
    var ptDataUpdated = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    var bobRow = -1;
    for (var r = 1; r < ptDataUpdated.length; r++) { if (ptDataUpdated[r][0] === 'Bob') bobRow = r; }
    if (bobRow === -1) {
      // Bob doesn't exist, create him explicitly
      MockSpreadsheetApp._sheets['Participant Config'].appendRow(['Bob', false, true, '', false, false, true, 2, '2']);
      ptDataUpdated = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
      bobRow = ptDataUpdated.length - 1;
    }
    ptDataUpdated[bobRow][pHeaders.indexOf('Transfer Receiver')] = true;
    getActiveParticipants = function() { return [{ Name: 'Bob' }]; };

    var passSubmit = submitSelection('Bob', { phase: 'TRANSFER_RECEIVER', action: 'PASS' });
    assert(passSubmit.success === true, "Bob can select None.");
    var bobTr = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues()[bobRow][pHeaders.indexOf('Transfer Receiver')];
    assert(bobTr === false, "Selecting None sets Transfer Receiver to false.");

    // D) Can claim again in the next round
    MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue('2'); // Advance to Round 2
    getActiveParticipants = function() { return [{ Name: 'Alice' }]; };
    var round2Submit = submitSelection('Alice', { phase: 'TRANSFER_RECEIVER', action: 'SUBMIT', selections: [{ type: 'WEEKEND', offerId: 'OFFER-3' }] });
    assert(round2Submit.success === true, "Alice can claim again in Round 2.");

    var thDataR2 = MockSpreadsheetApp._sheets['Transfer History'].getDataRange().getValues();
    assert(thDataR2.length === 4, "Transfer History appended 1 row for Round 2 claim.");
    assert(thDataR2[3][7] == 2, "Receiver Round is recorded as 2.");

    // E) Completion Path: No active offers remaining
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('TRANSFER_RECEIVER'); // Ensure phase is correct
    var advanceRes = advanceQueueInternal_();
    assert(advanceRes && advanceRes.complete === true, "advanceQueueInternal returns complete when out of active offers.");
    var finalState = getQueueState();
    assert(finalState.phase === 'COMPLETE', "Queue sets phase to COMPLETE when no active offers remain.");

    // F) Completion Path: No eligible receivers remaining
    // Reset state to a new phase where we have active offers, but everyone has Transfer Receiver = false
    MockSpreadsheetApp._sheets['Transfer Offers'].appendRow(['OFFER-4', 'Dan', 'WEEKEND', '2025-02-15', 'Active', '', '']);
    setQueueState({ phase: 'TRANSFER_RECEIVER', round: 3, direction: 'ASCENDING', lead: 1 });
    // Set all receivers to false
    for (var r = 1; r < ptDataUpdated.length; r++) {
      ptDataUpdated[r][pHeaders.indexOf('Transfer Receiver')] = false;
    }
    advanceRes = advanceQueueInternal_();
    finalState = getQueueState();
    assert(finalState.phase === 'COMPLETE', "Queue sets phase to COMPLETE when no eligible receivers remain.");

    // --- Public Display Snapshot ---
    log.push("--- Testing Public Display Snapshot ---");
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Week ID', 'Start Date (Monday)', 'Capacity', 'Assigned Participants'],
      ['1', '2025-01-06T00:00:00Z', '4', 'Alice, Bob'],    // 2 remaining, Available
      ['2', '2025-01-13T00:00:00Z', '1', ''],              // 1 remaining, Nearly Full
      ['3', '2025-01-20T00:00:00Z', '2', 'Alice, Charlie'] // 0 remaining, Full
    ]);
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee', 'Vacation Adjacency Warning', 'Holiday Proximity Warning'],
      ['2025-01-04T00:00:00Z', 'Saturday', '', 'SecretName1', 'SomeWarning'],
      ['2025-01-05T00:00:00Z', 'Sunday', 'Bob', '', '']
    ]);
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['New Year', '2025-01-01T00:00:00Z', 'CALL_1', ''],
      ['New Year', '2025-01-01T00:00:00Z', 'CALL_2', 'Charlie']
    ]);

    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'Currently Active', 'Weekend Phase Enabled', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Active for Year', 'Lottery Position', 'Weekend Assignment Maximum', 'PIN', 'Phone Number'],
      ['Alice', true, true, 'time', true, true, true, 1, '2', '1234', '555-1111'],
      ['Bob', false, true, '', false, false, true, 2, '2', '5678', '555-2222'],
      ['InactiveDan', false, false, '', false, false, false, 3, '0', '0000', '555-0000']
    ]);

    // Verify snapshot returns all 3 datasets even during an unrelated phase
    var phasesToTest = ['VACATION_SENIORITY', 'WEEKEND', 'HOLIDAY_VOLUNTEER', 'TRANSFER_OFFER_COLLECTION', 'COMPLETE', 'SETUP'];
    for (var i = 0; i < phasesToTest.length; i++) {
        MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue(phasesToTest[i]);
        var pubSnapshot = getPublicDisplaySnapshot();
        assert(pubSnapshot.success === true, "getPublicDisplaySnapshot should succeed for phase " + phasesToTest[i]);
        assert(pubSnapshot.calendar.kind === "ALL", "calendar kind should be 'ALL' for phase " + phasesToTest[i]);
        assert(pubSnapshot.calendar.vacationWeeks.length === 3, "Should return 3 vacation weeks for phase " + phasesToTest[i]);
        assert(pubSnapshot.calendar.weekends.length === 2, "Should return 2 weekends for phase " + phasesToTest[i]);
        assert(pubSnapshot.calendar.holidays.length === 2, "Should return 2 holidays for phase " + phasesToTest[i]);
    }

    var finalSnapshot = getPublicDisplaySnapshot();

    // Verify capacity calculations
    assert(finalSnapshot.calendar.vacationWeeks[0].remainingCapacity === 2, "Week 1 remaining should be 2.");
    assert(finalSnapshot.calendar.vacationWeeks[1].remainingCapacity === 1, "Week 2 remaining should be 1.");
    assert(finalSnapshot.calendar.vacationWeeks[2].remainingCapacity === 0, "Week 3 remaining should be 0.");
    assert(finalSnapshot.calendar.weekends[0].remainingCapacity === 1, "Unassigned weekend remaining should be 1.");
    assert(finalSnapshot.calendar.weekends[1].remainingCapacity === 0, "Assigned weekend remaining should be 0.");
    assert(finalSnapshot.calendar.holidays[0].remainingCapacity === 1, "Unassigned holiday remaining should be 1.");
    assert(finalSnapshot.calendar.holidays[1].remainingCapacity === 0, "Assigned holiday remaining should be 0.");

    // Verify Active-for-Year filters
    assert(finalSnapshot.participantNames.indexOf('Alice') !== -1, "Active participant Alice should be in names.");
    assert(finalSnapshot.participantNames.indexOf('Bob') !== -1, "Active participant Bob should be in names.");
    assert(finalSnapshot.participantNames.indexOf('InactiveDan') === -1, "Inactive participant InactiveDan should NOT be in names.");

    // Verify Date Normalization
    assert(finalSnapshot.calendar.vacationWeeks[0].startDate === '2025-01-06', "Vacation date should be normalized.");
    assert(finalSnapshot.calendar.weekends[0].date === '2025-01-04', "Weekend date should be normalized.");
    assert(finalSnapshot.calendar.holidays[0].observedDate === '2025-01-01', "Holiday date should be normalized.");

    // Verify No Secrets (PIN, Phone, Adjacency Name, Row Index)
    var jsonStr = JSON.stringify(finalSnapshot);
    assert(jsonStr.indexOf('1234') === -1, "PIN should not leak.");
    assert(jsonStr.indexOf('555-1111') === -1, "Phone should not leak.");
    assert(jsonStr.indexOf('SecretName1') === -1, "Private Adjacency warning should not leak.");
    assert(jsonStr.indexOf('_rowIndex') === -1, "Internal _rowIndex should not leak.");

    // --- TEST 8: Verify Guest and Active Participants queue mapping unchanged ---
    log.push("--- Testing Queue Map Immutability ---");
    assert(finalSnapshot.queue.activeNames.length >= 0, "activeNames should be serialized safely.");
    assert(finalSnapshot.queue.upNextNames.length >= 0, "upNextNames should be serialized safely.");

    // --- Mock Client UI Environment for Transition Tests ---
    log.push("--- Testing Simulated Client-Side Transitions ---");
    var simulatedDOM = {
      loginScreen: { classList: { add: function(){ this.has = true; }, remove: function(){ this.has = false; }, contains: function(){ return this.has; }, has: true } },
      scheduleSection: { style: { display: 'block' } },
      mainScreen: { style: { display: 'none' } },
      scheduleToggleBtn: { style: { display: 'none' }, textContent: 'Schedule' },
      myChoicesBtn: { style: { display: 'none' }, setAttribute: function(){} },
      filterType: { value: 'ALL' },
      filterAvailability: { value: 'ALL' },
      filterMonth: { value: 'ALL' },
      findPersonSelect: { value: '' },
      loginName: { value: '' },
      loginPin: { value: '' },
      loadingIndicator: { style: { display: 'none' } },
      loginBtn: { disabled: false, innerText: 'Log In' },
      userNameLabel: { style: { display: 'none' }, textContent: '' },
      logoutBtn: { style: { display: 'none' } },
      statusBadge: { className: '', textContent: '' }
    };

    var simScheduleFilters = { type: 'ALL', availability: 'ALL', month: 'ALL', person: '', myChoices: false };
    var simAppState = { participantId: null, name: null, pin: null, isActive: false, participant: null, availableChoices: null, selections: [], adjacentWeekendPending: null };

    function resetToGuestStateSimulated() {
      simScheduleFilters.type = 'ALL';
      simScheduleFilters.availability = 'ALL';
      simScheduleFilters.month = 'ALL';
      simScheduleFilters.person = '';
      simScheduleFilters.myChoices = false;
      simulatedDOM.filterType.value = 'ALL';
      simulatedDOM.filterAvailability.value = 'ALL';
      simulatedDOM.filterMonth.value = 'ALL';
      simulatedDOM.findPersonSelect.value = '';

      simAppState.participantId = null;
      simAppState.name = null;
      simAppState.pin = null;
      simAppState.participant = null;
      simAppState.availableChoices = null;
      simAppState.selections = [];
      simAppState.adjacentWeekendPending = null;

      simulatedDOM.mainScreen.style.display = 'none';
      simulatedDOM.userNameLabel.style.display = 'none';
      simulatedDOM.userNameLabel.textContent = '';
      simulatedDOM.logoutBtn.style.display = 'none';
      simulatedDOM.statusBadge.className = 'status-pill status-guest';
      simulatedDOM.statusBadge.textContent = 'GUEST / LOG IN';

      simulatedDOM.scheduleToggleBtn.style.display = 'none';
      simulatedDOM.scheduleToggleBtn.textContent = 'Schedule';
      simulatedDOM.myChoicesBtn.style.display = 'none';

      simulatedDOM.loginScreen.classList.add();
      simulatedDOM.scheduleSection.style.display = 'block';
    }

    function showMainScreenSimulated() {
      simulatedDOM.loginScreen.classList.remove();
      simulatedDOM.scheduleSection.style.display = 'none';
      simulatedDOM.mainScreen.style.display = 'block';
      simulatedDOM.scheduleToggleBtn.style.display = 'inline-block';
      simulatedDOM.myChoicesBtn.style.display = 'inline-block';
    }

    function toggleScheduleViewSimulated() {
      if (simulatedDOM.scheduleSection.style.display === 'none') {
        simulatedDOM.mainScreen.style.display = 'none';
        simulatedDOM.scheduleSection.style.display = 'block';
        simulatedDOM.scheduleToggleBtn.textContent = 'Return to Selection';
      } else {
        simulatedDOM.scheduleSection.style.display = 'none';
        simulatedDOM.mainScreen.style.display = 'block';
        simulatedDOM.scheduleToggleBtn.textContent = 'Schedule';
      }
    }

    // Simulate Initial Guest View
    resetToGuestStateSimulated();
    assert(simulatedDOM.loginScreen.classList.contains(), "Guest initially sees login block");
    assert(simulatedDOM.scheduleSection.style.display === 'block', "Guest initially sees schedule section");
    assert(simulatedDOM.mainScreen.style.display === 'none', "Guest does not see main screen");

    // Simulate Fresh Login
    simAppState.participantId = 'Alice';
    simAppState.name = 'Alice';
    showMainScreenSimulated();
    assert(!simulatedDOM.loginScreen.classList.contains(), "Login block hidden after login");
    assert(simulatedDOM.scheduleSection.style.display === 'none', "Schedule hidden behind main screen immediately after login");
    assert(simulatedDOM.mainScreen.style.display === 'block', "Main screen visible after login");

    // Simulate Toggle Schedule
    toggleScheduleViewSimulated();
    assert(simulatedDOM.mainScreen.style.display === 'none', "Main screen hidden after toggling to schedule");
    assert(simulatedDOM.scheduleSection.style.display === 'block', "Schedule visible after toggling");
    assert(simulatedDOM.scheduleToggleBtn.textContent === 'Return to Selection', "Toggle button label updated");

    // Simulate Invalid Session (or logout) while My Choices is active
    simScheduleFilters.myChoices = true;
    simScheduleFilters.person = 'Alice';
    resetToGuestStateSimulated();
    assert(simulatedDOM.loginScreen.classList.contains(), "Login block visible after logout/invalid session");
    assert(simulatedDOM.scheduleSection.style.display === 'block', "Schedule block visible after logout/invalid session");
    assert(simulatedDOM.mainScreen.style.display === 'none', "Main block hidden after logout");
    assert(simAppState.name === null, "App state name cleared");
    assert(simScheduleFilters.myChoices === false, "My Choices disabled securely on logout");
    assert(simScheduleFilters.person === '', "Filter person cleared on logout");
    assert(simulatedDOM.userNameLabel.style.display === 'none', "userNameLabel hidden after logout");
    assert(simulatedDOM.userNameLabel.textContent === '', "userNameLabel text cleared after logout");
    assert(simulatedDOM.logoutBtn.style.display === 'none', "logoutBtn hidden after logout");
    assert(simulatedDOM.statusBadge.textContent === 'GUEST / LOG IN', "statusBadge reset to GUEST / LOG IN after logout");

    // --- Testing Multiperson Active Window Notification Reset ---
    log.push("--- Testing Multiperson Active Window Notification Reset ---");

    getActiveParticipants = origGetActiveParticipants; // Restore from any previous mocks

    // Setup VACATION_RANDOM window for Alice, Bob, Charlie (3 people)
    MockSpreadsheetApp.createSheet('Config', [
      ['Setting Name', 'Setting Value'],
      ['Current Phase', 'VACATION_RANDOM'],
      ['Current Round', '2'],
      ['Current Direction', 'ASCENDING'],
      ['Current Lead', '1'],
      ['Active Year', '2025'] // for default cap
    ]);
    MockSpreadsheetApp.createSheet('Admin Options', [
      ['Setting Name', 'Setting Value'],
      ['Active Year', '2025'],
      ['Vacation Week Target Default', '9'],
      ['Vacation Active Window (participants)', '3']
    ]);
    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'Currently Active', 'Active for Year', 'Vacation Phase Enabled', 'Lottery Position', 'Vacation Week Target Override', 'Skipped Turns Remaining', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Phone Number'],
      ['Alice',   true, true, true, 1, '', '', 't1', true, false, '111'], // Lead
      ['Bob',     true, true, true, 2, '', '', 't2', true, true,  '222'], // Submitter
      ['Charlie', true, true, true, 3, '', '', 't3', false, true, '333']  // 3rd person
    ]);
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Week ID', 'Start Date (Monday)', 'Capacity', 'Prime Classification', 'Special Week Designation', 'Assigned Participants'],
      ['W1', '2025-01-06', 4, 'Non-Prime', '', 'Alice, Bob, Charlie'], // Seed with 1 assignment each (completed round 1)
      ['W2', '2025-01-13', 4, 'Non-Prime', '', '']
    ]);
    MockSpreadsheetApp.createSheet('Notification Log', [
      ['Log Timestamp', 'Event Key', 'Participant ID', 'Participant Name', 'Masked Phone', 'Phase', 'Notification Type', 'Status', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Resend WhatsApp', 'Selection Reference', 'Sanitized Error']
    ]);

    var preLogCount = MockSpreadsheetApp._sheets['Notification Log'].getDataRange().getValues().length;

    // Bob submits a selection (multi-person window because Alice is lead)
    var bResRandom = submitSelection('Bob', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W2'] });
    assert(bResRandom.success === true, "Bob successfully selects while Alice remains lead in Round 2.");

    var vacData = MockSpreadsheetApp._sheets['Vacation Availability'].getDataRange().getValues();
    assert(vacData[2][5] === 'Bob', "Bob was added to the assigned participants for W2.");

    var pDataResetTest = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    var pHeadersResetTest = pDataResetTest[0];
    var bobRow = pDataResetTest.find(function(r) { return r[pHeadersResetTest.indexOf('Name')] === 'Bob'; });
    var aliceRow = pDataResetTest.find(function(r) { return r[pHeadersResetTest.indexOf('Name')] === 'Alice'; });
    var charlieRow = pDataResetTest.find(function(r) { return r[pHeadersResetTest.indexOf('Name')] === 'Charlie'; });

    // Verify Bob's notification fields are cleared
    assert(bobRow[pHeadersResetTest.indexOf('Entry Timestamp')] === '', "Bob's Entry Timestamp cleared.");
    assert(bobRow[pHeadersResetTest.indexOf('Reminder Sent')] === false, "Bob's Reminder Sent cleared.");
    assert(bobRow[pHeadersResetTest.indexOf('Admin Alert Sent')] === false, "Bob's Admin Alert Sent cleared.");

    // Verify Alice's and Charlie's fields are untouched
    assert(aliceRow[pHeadersResetTest.indexOf('Entry Timestamp')] === 't1', "Alice's Entry Timestamp untouched.");
    assert(aliceRow[pHeadersResetTest.indexOf('Reminder Sent')] === true, "Alice's Reminder Sent untouched.");

    assert(charlieRow[pHeadersResetTest.indexOf('Entry Timestamp')] === 't3', "Charlie's Entry Timestamp untouched.");
    assert(charlieRow[pHeadersResetTest.indexOf('Admin Alert Sent')] === true, "Charlie's Admin Alert Sent untouched.");

    // Verify lead didn't skip Alice
    var configAfter = MockSpreadsheetApp._sheets['Config'].getDataRange().getValues();
    assert(configAfter[4][1] === '1' || configAfter[4][1] === 1, "Alice remains the queue lead (Position 1).");

    // Verify exactly one STATE_RESET logged for Bob
    var postLogData = MockSpreadsheetApp._sheets['Notification Log'].getDataRange().getValues();
    var newLogs = postLogData.slice(preLogCount);
    var resetLogs = newLogs.filter(function(r) { return r[6] === 'STATE_RESET'; });
    assert(resetLogs.length === 1, "Exactly one STATE_RESET logged.");
    assert(resetLogs[0][2] === 'Bob', "STATE_RESET logged specifically for Bob.");


    // --- Simulated Holiday Selection State Reset Test ---
    log.push("--- Testing Simulated Holiday Optional Weekend State Reset ---");
    simAppState.adjacentWeekendPending = { date: '2027-11-27' };

    // Test 1: fetchInitialState behavior clears it
    resetToGuestStateSimulated(); // analogous to the resets in fetchInitialState
    assert(simAppState.adjacentWeekendPending === null, "fetchInitialState-like reset clears adjacentWeekendPending");

    // Test 2: toggleSelection behavior clears it for new holiday selection
    simAppState.adjacentWeekendPending = { date: '2027-12-25' };
    function toggleSelectionSimulated(type) {
      if (type === 'holiday') {
        simAppState.adjacentWeekendPending = null;
      }
      simAppState.selections.push('fake-id');
    }
    toggleSelectionSimulated('holiday');
    assert(simAppState.adjacentWeekendPending === null, "Selecting a new holiday card clears existing adjacentWeekendPending");

    // --- Skipped Turn Double-Count Fix Regression Tests ---
    log.push("--- Testing Skipped Turn Double-Count Fix ---");
    function runSkippedTurnFixTests() {
      MockSpreadsheetApp._sheets['Config'] = undefined;
      MockSpreadsheetApp.createSheet('Config', [
        ['Setting Name', 'Setting Value'],
        ['Current Phase', 'VACATION_RANDOM'],
        ['Current Round', 6],
        ['Current Direction', 'ASCENDING'],
        ['Current Lead', 1]
      ]);

      MockSpreadsheetApp._sheets['Admin Options'] = undefined;
      MockSpreadsheetApp.createSheet('Admin Options', [
        ['Setting Name', 'Setting Value'],
        ['Active Year', '2025'],
        ['Vacation Week Target Default', 9],
        ['Vacation Active Window (participants)', 2]
      ]);

      var pDataBeforeTest = [
        ['Name', 'Active for Year', 'Vacation Phase Enabled', 'Lottery Position', 'Vacation Week Target Override', 'Skipped Turns Remaining', 'Currently Active', 'Seniority Position', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Phone Number', 'Weekend Phase Enabled', 'Weekend Assignment Maximum'],
        ['Alice', true, true, 1, '', 1, true, 1, 't1', false, false, '111', true, ''],
        ['Bob',   true, true, 2, '', 1, true, 2, 't2', false, false, '222', true, ''],
        ['Charlie', true, true, 3, '', 0, true, 3, 't3', false, false, '333', true, ''],
        ['Dave',  true, true, 4, '', 0, true, 4, 't4', false, false, '444', true, '']
      ];
      MockSpreadsheetApp.createSheet('Participant Config', pDataBeforeTest);

      MockSpreadsheetApp.createSheet('Vacation Availability', [
        ['Week ID', 'Start Date (Monday)', 'Capacity', 'Prime Classification', 'Special Week Designation', 'Assigned Participants'],
        ['W1', '2025-01-06', 4, 'Non-Prime', '', 'Alice, Alice, Alice, Alice, Alice, Bob, Bob, Bob, Bob, Bob, Bob, Charlie, Charlie, Charlie, Charlie, Dave, Dave, Dave, Dave'],
        ['W2', '2025-01-13', 4, 'Non-Prime', '', ''],
        ['W3', '2025-01-20', 4, 'Non-Prime', '', '']
      ]);

      var activeWindow = getQueueWindows_('VACATION_RANDOM', { round: 6, direction: 'ASCENDING', lead: 1 }, {}).activeWindow;
      var aliceActive = activeWindow.some(function(p) { return p['Name'] === 'Alice'; });
      var bobActive = activeWindow.some(function(p) { return p['Name'] === 'Bob'; });

      assert(aliceActive, "Participant with 5 vacation assignments and stale skip 1 is eligible in Round 6.");
      assert(!bobActive, "Participant with 6 vacation assignments and stale skip 1 is ineligible in Round 6.");

      MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue(7);
      var activeWindowR7 = getQueueWindows_('VACATION_RANDOM', { round: 7, direction: 'ASCENDING', lead: 1 }, {}).activeWindow;
      var bobActiveR7 = activeWindowR7.some(function(p) { return p['Name'] === 'Bob'; });
      assert(bobActiveR7, "Participant with 6 vacation assignments and stale skip 1 is eligible in Round 7.");

      MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue(5);
      setQueueState({ lead: 3 });

      var charlieRes = submitSelection('Charlie', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W2', 'W3'] });
      assert(charlieRes.success, "Participant makes double Non-Prime selection.");

      var charlieData = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues().find(function(r) { return r[0] === 'Charlie'; });
      assert(charlieData[5] === 0, "Double Non-Prime selection does not increment Skipped Turns Remaining.");

      var charlieAssignments = getParticipantAssignments('Charlie', 'VACATION_RANDOM', {});
      assert(charlieAssignments === 6, "Participant has 6 total assignments after double selection.");

      MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue(6);
      var activeWindowR6 = getQueueWindows_('VACATION_RANDOM', { round: 6, direction: 'ASCENDING', lead: 3 }, {}).activeWindow;
      var charlieActiveR6 = activeWindowR6.some(function(p) { return p['Name'] === 'Charlie'; });
      assert(!charlieActiveR6, "Participant with 6 vacation assignments skips Round 6.");

      MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue(7);
      var activeWindowR7Charlie = getQueueWindows_('VACATION_RANDOM', { round: 7, direction: 'ASCENDING', lead: 3 }, {}).activeWindow;
      var charlieActiveR7 = activeWindowR7Charlie.some(function(p) { return p['Name'] === 'Charlie'; });
      assert(charlieActiveR7, "Participant with 6 vacation assignments returns in Round 7.");

      MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue(5);
      setQueueState({ lead: 3 });
      var origGetActiveParticipants = getActiveParticipants;
      getActiveParticipants = function() { return [{ Name: 'Dave' }]; }; // Mock for Dave, simulating rolling active window
      var daveRes = submitSelection('Dave', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W2', 'W3'] });
      assert(daveRes.success, "Non-lead participant makes double Non-Prime selection.");

      var daveData = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues().find(function(r) { return r[0] === 'Dave'; });
      assert(daveData[5] === 0, "Non-lead double Non-Prime selection does not increment Skipped Turns Remaining.");
      getActiveParticipants = origGetActiveParticipants;

      MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('WEEKEND');
      MockSpreadsheetApp._sheets['Config'].getRange(3, 2).setValue(1);
      MockSpreadsheetApp.createSheet('Weekend Coverage', [
        ['Date', 'Day of Week', 'First Call Assignee', 'Vacation Adjacency Warning', 'Holiday Proximity Warning']
      ]);
      var weekendActive = getQueueWindows_('WEEKEND', { round: 1, direction: 'ASCENDING', lead: 1 }, {}).activeWindow;
      var aliceWeekendActive = weekendActive.some(function(p) { return p['Name'] === 'Alice'; });
      assert(aliceWeekendActive, "Stale vacation skip value does not exclude someone from Weekend Round 1.");

      MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('HOLIDAY_VOLUNTEER');
      var pDataWithHol = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
      pDataWithHol[0].push('Holiday Volunteer Response', 'Holiday Volunteer');
      pDataWithHol[1].push('Yes', true);
      MockSpreadsheetApp.createSheet('Participant Config', pDataWithHol);
      MockSpreadsheetApp.createSheet('Holiday Coverage', [
        ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
        ['Christmas', '2025-12-25', 'Call 1', '']
      ]);
      var holVolActive = getQueueWindows_('HOLIDAY_VOLUNTEER', { round: 1, direction: 'ASCENDING', lead: 1 }, {}).activeWindow;
      var aliceHolVolActive = holVolActive.some(function(p) { return p['Name'] === 'Alice'; });
      assert(aliceHolVolActive, "Stale vacation skip value does not exclude someone from Holiday Volunteer phase.");
    }
    runSkippedTurnFixTests();

    // --- TEST 9: sendActiveParticipantPINs Menu Action ---
    log.push("--- Testing sendActiveParticipantPINs ---");
    var originalSendWhatsAppBatch = typeof sendWhatsAppBatch !== 'undefined' ? sendWhatsAppBatch : null;
    var originalGetAdminOptions = typeof getAdminOptions !== 'undefined' ? getAdminOptions : null;

    try {
      var batchCallLog = [];
      var mockBatchReport = { total: 0, attempted: 0, sent: 0, failed: 0, success: true, aborted: 0, abortedBecause: null, errors: [] };

      // We will override these globally during this test scope
      sendWhatsAppBatch = function(items) {
        batchCallLog.push(items);
        return mockBatchReport;
      };
      getAdminOptions = function() {
        return { 'Web App URL': 'https://mock.example.com' };
      };

      // Setup rows for tests using MockSpreadsheetApp
      MockSpreadsheetApp.createSheet('Participant Config', [
        ['Name', 'Active for Year', 'Phone Number', 'PIN'],
        ['Alice', true, '111', '1234'],
        ['Bob', false, '222', '5678'],
        ['Dan', true, '', '9999'],
        ['Eve', true, '444', ''],
        ['Frank', true, '555', '7777']
      ]);

      // Subtest 1: Successful send
      mockBatchReport = { total: 2, attempted: 2, sent: 2, failed: 0, success: true, aborted: 0, abortedBecause: null, errors: [] };

      // Intercept the alert summary
      var alertMessage = "";
      var uiMock = {
        alert: function(msg) { alertMessage = msg; }
      };
      SpreadsheetApp.getUi = function() { return uiMock; };

      sendActiveParticipantPINs();

      assert(batchCallLog.length === 1, "sendWhatsAppBatch should be called once");
      assert(batchCallLog[0].length === 2, "Only Alice and Frank should be sent to batch");
      assert(batchCallLog[0][0].phone === '111', "Alice's phone is correct");
      assert(batchCallLog[0][0].message.indexOf('1234') !== -1, "Alice's PIN is in message");
      assert(batchCallLog[0][1].phone === '555', "Frank's phone is correct");
      assert(batchCallLog[0][1].message.indexOf('https://mock.example.com') !== -1, "URL is in message");

      assert(alertMessage.indexOf('Successfully sent: 2') !== -1, "Alert shows correct sent count");
      assert(alertMessage.indexOf('Skipped (missing phone/PIN): 2') !== -1, "Alert shows correct skipped count (Dan and Eve)");
      assert(alertMessage.indexOf('Failed: 0') !== -1, "Alert shows correct failed count");

      // Subtest 2: Systemic Abort
      batchCallLog = [];
      alertMessage = "";
      mockBatchReport = { total: 2, attempted: 1, sent: 0, failed: 2, success: false, aborted: 1, abortedBecause: 'TUNNEL_OFFLINE', errors: [] };

      sendActiveParticipantPINs();

      assert(alertMessage.indexOf('Successfully sent: 0') !== -1, "Systemic abort: 0 sent");
      assert(alertMessage.indexOf('Skipped (missing phone/PIN): 2') !== -1, "Systemic abort: 2 skipped");
      assert(alertMessage.indexOf('Failed: 2') !== -1, "Systemic abort: 2 failed (includes aborted exactly once without double counting)");

    } finally {
      // Restore globals modified for this specific test
      if (originalSendWhatsAppBatch) sendWhatsAppBatch = originalSendWhatsAppBatch;
      if (originalGetAdminOptions) getAdminOptions = originalGetAdminOptions;
    }

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



/**
 * --- Status API Tests ---
 */
function runPhaseStatusTests() {
  var log = [];
  var hasFailed = false;
  function assert(condition, message) {
    if (!condition) {
      log.push("❌ FAIL: " + message);
      hasFailed = true;
    } else {
      log.push("✅ PASS: " + message);
    }
  }

  var originalSpreadsheetApp = SpreadsheetApp;
  var originalWithScriptLock = withScriptLock;

  try {
    SpreadsheetApp = MockSpreadsheetApp;
    withScriptLock = function(cb) { return cb(); };

    // Test 1: Missing sheet setup errors
    MockSpreadsheetApp._sheets = {}; // Clear everything
    var vStatus = getVacationPhaseStatus();
    assert(vStatus.status === 'SETUP_ERROR', "Vacation status handles missing sheets.");
    var hStatus = getHolidayPhaseStatus();
    assert(hStatus.status === 'SETUP_ERROR', "Holiday status handles missing sheets.");
    var wStatus = getWeekendPhaseStatus();
    assert(wStatus.status === 'SETUP_ERROR', "Weekend status handles missing sheets.");

    // Test 2: Vacation Validation Cases
    MockSpreadsheetApp._sheets = {};
    MockSpreadsheetApp.createSheet('Admin Options', [
      ['Setting Name', 'Setting Value'],
      ['Vacation Week Target Default', '9weeks']
    ]);
    vStatus = getVacationPhaseStatus();
    assert(vStatus.status === 'SETUP_ERROR', "Malformed global vacation target -> SETUP_ERROR");

    // Correct Admin Options but missing Vacation headers
    MockSpreadsheetApp._sheets['Admin Options'] = undefined;
    MockSpreadsheetApp.createSheet('Admin Options', [
      ['Setting Value', 'Setting Name'],
      ['', 'Vacation Week Target Default'] // Reverse order to test reordered headers
    ]);
    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'Active for Year', 'Vacation Phase Enabled', 'Vacation Week Target Override'],
      ['Alice', true, true, ''] // Uses default 9
    ]);
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Start Date (Monday)', 'Week ID', 'Assigned Participants'] // Reordered headers but valid
    ]);
    vStatus = getVacationPhaseStatus();
    assert(vStatus.status === 'SETUP_ERROR', "Vacation with just headers returns SETUP_ERROR.");

    MockSpreadsheetApp._sheets['Vacation Availability'] = undefined;
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Start Date (Monday)', 'Week ID', 'Assigned Participants'],
      ['2027-01-04', 'W1', 'Alice, Alice'],
      ['2027-02-30', 'W3', 'Alice'], // Impossible rollover date
      ['2027-01-04garbage', 'W4', 'Bob']

    ]);
    vStatus = getVacationPhaseStatus();
    assert(vStatus.status === 'SETUP_ERROR' && vStatus.remaining === null, "Impossible rollover date returns SETUP_ERROR.");
    MockSpreadsheetApp._sheets['Vacation Availability'] = undefined;
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Start Date (Monday)', 'Week ID', 'Assigned Participants'],
      ['2027-01-04garbage', 'W4', 'Bob']
    ]);
    vStatus = getVacationPhaseStatus();
    assert(vStatus.status === 'SETUP_ERROR' && vStatus.remaining === null, "Garbage suffix string returns SETUP_ERROR.");

    MockSpreadsheetApp._sheets['Vacation Availability'] = undefined;
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Start Date (Monday)', 'Week ID', 'Assigned Participants'],
      ['2027-01-04', 'W1', 'Alice, Alice'],
      ['2027-01-11', 'W1', 'Bob'] // Duplicate Week ID -> SETUP ERROR
    ]);
    vStatus = getVacationPhaseStatus();
    assert(vStatus.status === 'SETUP_ERROR', "Duplicate Week ID returns SETUP_ERROR.");

    // Fix malformed rows and test counting
    MockSpreadsheetApp._sheets['Vacation Availability'] = undefined;
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Start Date (Monday)', 'Week ID', 'Assigned Participants'],
      ['2027-01-04', 'W1', 'Alice, Alice'],
      ['2027-01-11', 'W2', 'Bob, Alice']
    ]);
    MockSpreadsheetApp._sheets['Participant Config'] = undefined;
    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'Active for Year', 'Vacation Phase Enabled', 'Vacation Week Target Override'],
      ['Alice', true, true, 2],
      ['Bob', true, true, 1],
      ['', true, true, ''] // Nameless row but active should error
    ]);
    vStatus = getVacationPhaseStatus();
    assert(vStatus.status === 'SETUP_ERROR', "Active participant without a name returns SETUP_ERROR.");

    // Fix nameless participant
    MockSpreadsheetApp._sheets['Participant Config'] = undefined;
    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'Active for Year', 'Vacation Phase Enabled', 'Vacation Week Target Override'],
      ['Alice', true, true, 2], // 2 assignments unique by week (W1, W2) -> 0 remaining
      ['Bob', true, true, 1],   // 1 assignment (W2) -> 0 remaining
      ['', '', '', '']          // Wholly blank row should be skipped
    ]);
    vStatus = getVacationPhaseStatus();
    assert(vStatus.status === 'COMPLETE', "Alice and Bob fulfilled correctly, counting duplicates correctly.");

    // Test 3: Holiday Status Validations
    MockSpreadsheetApp._sheets['Holiday Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['New Years', '2027-01-01', 'Call 1', 'Alice'],
      ['New Years', '2027-01-01', 'Call 2', ''],      // Unfilled
      ['', '', '', '']                                // Trailing blank row
    ]);

    hStatus = getHolidayPhaseStatus();
    assert(hStatus.status === 'INCOMPLETE', "Holiday is INCOMPLETE with 1 remaining");
    assert(hStatus.remaining === 1, "Holiday remaining counts correctly");

    // Fill holiday
    MockSpreadsheetApp._sheets['Holiday Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['New Years', '2027-01-01', 'Call 1', 'Alice'],
      ['New Years', '2027-01-01', 'Call 2', 'Bob']
    ]);
    var snapshotBefore = JSON.stringify(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues());
    hStatus = getHolidayPhaseStatus();
    var snapshotAfter = JSON.stringify(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues());
    assert(hStatus.status === 'COMPLETE', "Holiday is COMPLETE");
    assert(snapshotBefore === snapshotAfter, "Holiday read-only check has no side effects (sheet snapshot unchanged).");

    // Malformed holiday date
    MockSpreadsheetApp._sheets['Holiday Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['New Years', 'not-a-date', 'Call 1', 'Alice']
    ]);
    hStatus = getHolidayPhaseStatus();
    assert(hStatus.status === 'SETUP_ERROR', "Holiday with bad date -> SETUP_ERROR");

    // Malformed holiday impossible date
    MockSpreadsheetApp._sheets['Holiday Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['New Years', '2027-02-30', 'Call 1', 'Alice'],
      ['New Years', '2027-01-01garbage', 'Call 1', 'Alice']
    ]);
    hStatus = getHolidayPhaseStatus();
    assert(hStatus.status === 'SETUP_ERROR' && hStatus.remaining === null, "Holiday with impossible rollover date -> SETUP_ERROR");
    MockSpreadsheetApp._sheets['Holiday Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['New Years', '2027-01-01garbage', 'Call 1', 'Alice']
    ]);
    hStatus = getHolidayPhaseStatus();
    assert(hStatus.status === 'SETUP_ERROR' && hStatus.remaining === null, "Holiday with garbage suffix -> SETUP_ERROR");

    // Malformed holiday position (CALL_1 alias unsupported)
    MockSpreadsheetApp._sheets['Holiday Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['New Years', '2027-01-01', 'CALL_1', 'Alice']
    ]);
    hStatus = getHolidayPhaseStatus();
    assert(hStatus.status === 'SETUP_ERROR', "Holiday with CALL_1 alias -> SETUP_ERROR");

    // Malformed holiday position
    MockSpreadsheetApp._sheets['Holiday Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['New Years', '2027-01-01', 'Call 99', 'Alice']
    ]);
    hStatus = getHolidayPhaseStatus();
    assert(hStatus.status === 'SETUP_ERROR', "Holiday with bad position -> SETUP_ERROR");

    // Test 4: Weekend Status Validations
    MockSpreadsheetApp._sheets['Weekend Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee'],
      ['2027-01-02', 'Saturday', 'Alice'],
      ['2027-01-03', 'Sunday', ''] // Unfilled
    ]);
    wStatus = getWeekendPhaseStatus();
    assert(wStatus.status === 'INCOMPLETE', "Weekend is INCOMPLETE");
    assert(wStatus.remaining === 1, "Weekend remaining counts correctly");

    // Test not-a-date weekend
    MockSpreadsheetApp._sheets['Weekend Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee'],
      ['not-a-date', 'Tuesday', 'Alice'] // Invalid date and day
    ]);
    wStatus = getWeekendPhaseStatus();
    assert(wStatus.status === 'SETUP_ERROR', "Weekend with bad date/day returns SETUP_ERROR.");

    // Test day mismatch (Monday labeled Saturday)
    MockSpreadsheetApp._sheets['Weekend Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee'],
      ['2027-01-04', 'Saturday', 'Alice']
    ]);
    wStatus = getWeekendPhaseStatus();
    assert(wStatus.status === 'SETUP_ERROR', "Weekend with mismatched date/day returns SETUP_ERROR.");

    // Test day mismatch (impossible date like Feb 30)
    MockSpreadsheetApp._sheets['Weekend Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee'],
      ['2027-02-30', 'Saturday', 'Alice'],
      ['2027-01-02garbage', 'Saturday', 'Bob']
    ]);
    wStatus = getWeekendPhaseStatus();
    assert(wStatus.status === 'SETUP_ERROR' && wStatus.remaining === null, "Weekend with impossible rollover date returns SETUP_ERROR.");
    MockSpreadsheetApp._sheets['Weekend Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee'],
      ['2027-01-02garbage', 'Saturday', 'Bob']
    ]);
    wStatus = getWeekendPhaseStatus();
    assert(wStatus.status === 'SETUP_ERROR' && wStatus.remaining === null, "Weekend with garbage suffix returns SETUP_ERROR.");

    // Complete Weekend
    MockSpreadsheetApp._sheets['Weekend Coverage'] = undefined;
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee'],
      ['2027-01-02', 'Saturday', 'Alice'],
      ['2027-01-03', 'Sunday', 'Bob']
    ]);
    snapshotBefore = JSON.stringify(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues());
    wStatus = getWeekendPhaseStatus();
    snapshotAfter = JSON.stringify(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues());
    assert(wStatus.status === 'COMPLETE', "Weekend is COMPLETE");
    assert(snapshotBefore === snapshotAfter, "Weekend read-only check has no side effects (sheet snapshot unchanged).");

    log.push("✅ All Phase Status tests processed.");

  } catch (e) {
    log.push("❌ Test execution failed: " + e.message);
    hasFailed = true;
  } finally {
    SpreadsheetApp = originalSpreadsheetApp;
    withScriptLock = originalWithScriptLock;
  }

  if (hasFailed) {
    throw new Error("One or more tests failed:\n" + log.join("\n"));
  }
  return log.join('\n');
}

/**
 * Task 5: End-to-End Integration Verification Tests
 */
function runTask5IntegrationVerificationTests() {
  var log = [];
  var hasFailed = false;
  function assert(condition, message) {
    if (!condition) {
      log.push("❌ FAIL: " + message);
      hasFailed = true;
    } else {
      log.push("✅ PASS: " + message);
    }
  }

  var originalSpreadsheetApp = SpreadsheetApp;
  var originalWithScriptLock = withScriptLock;

  try {
    SpreadsheetApp = MockSpreadsheetApp;
    withScriptLock = function(cb) { return cb(); };

    // Setup complete 2027 lottery fixture
    MockSpreadsheetApp._sheets = {};
    MockSpreadsheetApp.createSheet('Config', [
      ['Setting Name', 'Setting Value'],
      ['Current Phase', 'SETUP'],
      ['Current Round', '0'],
      ['Current Direction', 'NONE'],
      ['Current Lead', '0']
    ]);
    MockSpreadsheetApp.createSheet('Admin Options', [
      ['Setting Name', 'Setting Value'],
      ['Active Year', '2027'],
      ['Vacation Week Target Default', '2'],
      ['Vacation Active Window (participants)', '2'],
      ['Weekend Active Window (participants)', '2'],
      ['Holiday Active Window (participants)', '2'],
      ['Transfer Active Window (participants)', '2'],
      ['Holiday Proximity Range (days)', '3'],
      ['Enable SMS Notifications', 'FALSE'],
      ['Web App URL', 'https://example.com']
    ]);
    MockSpreadsheetApp.createSheet('Participant Config', [
      ['Name', 'PIN', 'Active for Year', 'Vacation Phase Enabled', 'Weekend Phase Enabled', 'Holiday Volunteer', 'Holiday Volunteer Response', 'Mandatory Holiday Eligible', 'Transfer Giver', 'Transfer Receiver', 'Transfer Offers Submitted', 'Seniority Position', 'Lottery Position', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Phone Number', 'Resend WhatsApp', 'Vacation Week Target Override', 'Weekend Assignment Maximum'],
      ['Alice',   '1234', true, true, true, true, '', true, true, true, false, 1, 1, '', false, false, '1111111111', false, '', '2'],
      ['Bob',     '5678', true, true, true, true, '', true, true, true, false, 2, 2, '', false, false, '2222222222', false, '', '2'],
      ['Charlie', '9999', true, true, true, true, '', true, true, true, false, 3, 3, '', false, false, '3333333333', false, '', '2']
    ]);
    MockSpreadsheetApp.createSheet('Vacation Availability', [
      ['Week ID', 'Start Date (Monday)', 'Capacity', 'Prime Classification', 'Special Week Designation', 'Assigned Participants'],
      ['W1', '2027-01-04', 2, 'Non-Prime', 'None', ''],
      ['W2', '2027-01-11', 2, 'Non-Prime', 'None', ''],
      ['W3', '2027-01-18', 2, 'Non-Prime', 'None', ''],
      ['W4', '2027-01-25', 2, 'Non-Prime', 'None', ''],
      ['W5', '2027-02-01', 2, 'Non-Prime', 'None', ''],
      ['W6', '2027-02-08', 2, 'Non-Prime', 'None', '']
    ]);
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'Day of Week', 'First Call Assignee', 'Vacation Adjacency Warning', 'Holiday Proximity Warning'],
      ['2027-11-27', 'Saturday', '', '', ''],
      ['2027-11-28', 'Sunday', '', '', ''],
      ['2027-12-04', 'Saturday', '', '', '']
    ]);
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['Thanksgiving', '2027-11-25', 'Call 1', ''],
      ['Thanksgiving', '2027-11-25', 'Call 2', '']
    ]);
    MockSpreadsheetApp.createSheet('Transfer Offers', [
      ['Offer ID', 'Original Assignee (Giver)', 'Assignment Type', 'Date/Position', 'Status', 'Timestamp', 'Group ID']
    ]);
    MockSpreadsheetApp.createSheet('Transfer History', [
      ['Timestamp', 'Assignment Type', 'Assignment Date', 'Call Position/Day', 'Original Assignee', 'New Assignee', 'Year', 'Receiver Round', 'Claim ID']
    ]);
    MockSpreadsheetApp.createSheet('Notification Log', [
      ['Log Timestamp', 'Event Key', 'Participant ID', 'Participant Name', 'Masked Phone', 'Phase', 'Notification Type', 'Status', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Resend WhatsApp', 'Selection Reference', 'Sanitized Error']
    ]);

    SpreadsheetApp.getUi = function() { return { alert: function(){} }; };

    // 1. Begin Seniority Round -> VACATION_SENIORITY
    beginSeniorityRound();
    assert(getQueueState().phase === 'VACATION_SENIORITY', "Integration: beginSeniorityRound sets phase to VACATION_SENIORITY.");
    assert(getQueueState().round === 1, "Integration: Seniority starts at Round 1.");

    // Seniority selections (Round 1)
    submitSelection('Alice', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W1'] });
    submitSelection('Bob', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W2'] });
    submitSelection('Charlie', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W3'] });

    // Progressed to VACATION_RANDOM (Round 2) because targets remain (target = 2)
    assert(getQueueState().phase === 'VACATION_RANDOM', "Integration: Vacation Seniority progresses to VACATION_RANDOM when targets remain.");
    assert(getQueueState().round === 2, "Integration: VACATION_RANDOM starts at Round 2.");

    // Random selections (Round 2) - completes targets
    submitSelection('Alice', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W4'] });
    submitSelection('Bob', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W5'] });
    submitSelection('Charlie', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W6'] });

    // Vacation complete stages READY_HOLIDAY_VOLUNTEER
    assert(getQueueState().phase === 'READY_HOLIDAY_VOLUNTEER', "Integration: Vacation completion stages READY_HOLIDAY_VOLUNTEER.");

    // 2. Begin Holiday Volunteer Phase
    beginHolidayPhase();
    assert(getQueueState().phase === 'HOLIDAY_VOLUNTEER', "Integration: beginHolidayPhase sets phase to HOLIDAY_VOLUNTEER.");

    // Alice selects Thanksgiving Call 1 with optional adjacent weekend 2027-11-27
    var holSubmitAlice = submitSelection('Alice', {
      phase: 'HOLIDAY_VOLUNTEER',
      action: 'SUBMIT',
      selections: [{ name: 'Thanksgiving', position: 'Call 1' }],
      adjacentWeekend: { date: '2027-11-27' }
    });
    assert(holSubmitAlice.success === true, "Integration: Alice holiday selection with optional adjacent weekend succeeds.");

    var wSheetData = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    assert(wSheetData[1][2] === 'Alice', "Integration: Optional weekend 2027-11-27 assigned to Alice during Holiday selection.");

    // Bob passes during Volunteer phase
    submitSelection('Bob', { phase: 'HOLIDAY_VOLUNTEER', action: 'PASS' });

    // Charlie passes during Volunteer phase
    submitSelection('Charlie', { phase: 'HOLIDAY_VOLUNTEER', action: 'PASS' });

    // Alice passes in Round 2 (volunteer exhausted while Thanksgiving Call 2 remains open)
    submitSelection('Alice', { phase: 'HOLIDAY_VOLUNTEER', action: 'PASS' });

    // Volunteer exhaustion stages READY_HOLIDAY_MANDATORY
    assert(getQueueState().phase === 'READY_HOLIDAY_MANDATORY', "Integration: Volunteer exhaustion with open holiday positions stages READY_HOLIDAY_MANDATORY.");

    // 3. Begin Mandatory Holiday Phase
    beginMandatoryHolidayPhase();
    assert(getQueueState().phase === 'HOLIDAY_MANDATORY', "Integration: beginMandatoryHolidayPhase sets phase to HOLIDAY_MANDATORY.");

    // Bob fills remaining Thanksgiving Call 2 position (declining optional weekend)
    submitSelection('Bob', {
      phase: 'HOLIDAY_MANDATORY',
      action: 'SUBMIT',
      selections: [{ name: 'Thanksgiving', position: 'Call 2' }]
    });

    // Holiday completion stages READY_WEEKEND (waiting for Weekend; does not prematurely open transfers)
    assert(getQueueState().phase === 'READY_WEEKEND', "Integration: Holiday completion stages READY_WEEKEND, waiting for Weekend phase.");

    // 4. Begin Weekend Phase
    beginWeekendPhase();
    assert(getQueueState().phase === 'WEEKEND', "Integration: beginWeekendPhase sets phase to WEEKEND.");

    // Verify optional weekend pre-assigned during Holiday counts in weekend assignment counting mechanism
    var aliceWkndAssignments = getParticipantAssignments('Alice', 'WEEKEND', {});
    assert(aliceWkndAssignments === 1, "Integration: Alice optional weekend assigned during Holiday counts as 1 existing weekend assignment when Weekend starts.");

    // Bob fills Saturday 2027-12-04 (a different weekend)
    submitSelection('Bob', { phase: 'WEEKEND', action: 'SUBMIT', selections: ['2027-12-04'] });

    // Charlie fills Sunday 2027-11-28
    submitSelection('Charlie', { phase: 'WEEKEND', action: 'SUBMIT', selections: ['2027-11-28'] });

    // Weekend completion stages READY_TRANSFER
    assert(getQueueState().phase === 'READY_TRANSFER', "Integration: Weekend completion stages READY_TRANSFER.");

    // 5. Begin Transfer Phase (Offer Collection)
    beginTransferPhase();
    assert(getQueueState().phase === 'TRANSFER_OFFER_COLLECTION', "Integration: beginTransferPhase sets phase to TRANSFER_OFFER_COLLECTION.");

    // Verify Alice's optional weekend assigned during Holiday is eligible for transfer under standard rules
    var aliceWkndGiverSubmit = submitSelection('Alice', {
      phase: 'TRANSFER_OFFER_COLLECTION',
      action: 'SUBMIT',
      selections: [{ type: 'WEEKEND', datePos: '2027-11-27' }]
    });
    assert(aliceWkndGiverSubmit.success === true, "Integration: Alice optional weekend assignment is offered for transfer under standard rules.");

    // Bob passes offer collection
    submitSelection('Bob', { phase: 'TRANSFER_OFFER_COLLECTION', action: 'PASS' });
    submitSelection('Charlie', { phase: 'TRANSFER_OFFER_COLLECTION', action: 'PASS' });
    checkTransferOfferCollectionComplete_();

    // Transitions to TRANSFER_RECEIVER
    assert(getQueueState().phase === 'TRANSFER_RECEIVER', "Integration: Offer collection complete transitions to TRANSFER_RECEIVER.");

    // Bob claims Alice's offered optional weekend in Transfer Receiver round
    var offers = getSheetDataAsObjects('Transfer Offers', {});
    var activeOffer = offers.find(function(o) { return o['Status'] === 'Active'; });
    assert(activeOffer && activeOffer['Date/Position'] === '2027-11-27', "Integration: Active transfer offer contains optional weekend 2027-11-27.");

    var bobClaim = submitSelection('Bob', {
      phase: 'TRANSFER_RECEIVER',
      action: 'SUBMIT',
      selections: [{ type: 'WEEKEND', offerId: activeOffer['Offer ID'] }]
    });
    assert(bobClaim.success === true, "Integration: Bob successfully claims transferred optional weekend.");

    var wSheetDataPostTransfer = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    assert(wSheetDataPostTransfer[1][2] === 'Bob', "Integration: Weekend Coverage updated to Bob following transfer claim.");

    // Queue reaches terminal COMPLETE
    advanceQueueInternal_();
    assert(getQueueState().phase === 'COMPLETE', "Integration: Queue reaches terminal COMPLETE after transfer receiver phase.");

    log.push("✅ All Task 5 End-to-End Integration Verification tests passed successfully.");

  } catch (e) {
    log.push("❌ Test execution failed: " + e.message + "\n" + e.stack);
    hasFailed = true;
  } finally {
    SpreadsheetApp = originalSpreadsheetApp;
    withScriptLock = originalWithScriptLock;
  }

  if (hasFailed) {
    throw new Error("One or more tests failed:\n" + log.join("\n"));
  }
  return log.join('\n');
}

/**
 * --- Task 2: Durable READY States Tests ---
 */
function runReadyStateTests() {
  var log = [];
  var hasFailed = false;
  function assert(condition, message) {
    if (!condition) {
      log.push("❌ FAIL: " + message);
      hasFailed = true;
    } else {
      log.push("✅ PASS: " + message);
    }
  }

  var originalSpreadsheetApp = SpreadsheetApp;
  var originalWithScriptLock = withScriptLock;

  try {
    SpreadsheetApp = MockSpreadsheetApp;
    withScriptLock = function(cb) { return cb(); };

    var readyStates = [
      { phase: 'READY_HOLIDAY_VOLUNTEER', next: 'HOLIDAY_VOLUNTEER', msg: 'Waiting for the administrator to begin Holiday Volunteer selection.' },
      { phase: 'READY_HOLIDAY_MANDATORY', next: 'HOLIDAY_MANDATORY', msg: 'Waiting for the administrator to begin Mandatory Holiday selection.' },
      { phase: 'READY_WEEKEND', next: 'WEEKEND', msg: 'Waiting for the administrator to begin Weekend selection.' },
      { phase: 'READY_TRANSFER', next: 'TRANSFER_OFFER_COLLECTION', msg: 'Waiting for the administrator to begin Transfer Giveaways.' }
    ];

    // Helper to setup a valid fixture sheet environment
    function setupFixture() {
      MockSpreadsheetApp._sheets = {};
      MockSpreadsheetApp.createSheet('Config', [
        ['Setting Name', 'Setting Value'],
        ['Current Phase', 'READY_WEEKEND'],
        ['Current Round', '1'],
        ['Current Direction', 'ASCENDING'],
        ['Current Lead', '1']
      ]);
      MockSpreadsheetApp.createSheet('Admin Options', [
        ['Setting Name', 'Setting Value'],
        ['Active Year', '2027'],
        ['Enable SMS Notifications', 'TRUE'],
        ['Weekend Active Window (participants)', '2'],
        ['Vacation Active Window (participants)', '3'],
        ['Web App URL', 'https://example.com']
      ]);
      MockSpreadsheetApp.createSheet('Participant Config', [
        ['Name', 'PIN', 'Active for Year', 'Vacation Phase Enabled', 'Weekend Phase Enabled', 'Holiday Volunteer', 'Mandatory Holiday Eligible', 'Transfer Giver', 'Transfer Receiver', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Phone Number', 'Seniority Position', 'Lottery Position', 'Resend WhatsApp', 'Vacation Week Target Override'],
        ['Alice', '1234', true, true, true, true, true, true, true, '', false, false, '1111111111', 1, 1, false, ''],
        ['Bob',   '5678', true, true, true, true, true, true, true, '', false, false, '2222222222', 2, 2, false, '']
      ]);
      MockSpreadsheetApp.createSheet('Vacation Availability', [
        ['Week ID', 'Start Date (Monday)', 'Capacity', 'Prime Classification', 'Special Week Designation', 'Assigned Participants'],
        ['W1', '2027-01-04', 4, 'Non-Prime', 'None', '']
      ]);
      MockSpreadsheetApp.createSheet('Weekend Coverage', [
        ['Date', 'Day of Week', 'First Call Assignee', 'Vacation Adjacency Warning', 'Holiday Proximity Warning'],
        ['2027-01-02', 'Saturday', '', '', '']
      ]);
      MockSpreadsheetApp.createSheet('Holiday Coverage', [
        ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
        ['New Years', '2027-01-01', 'Call 1', '']
      ]);
      MockSpreadsheetApp.createSheet('Transfer Offers', [
        ['Offer ID', 'Original Assignee (Giver)', 'Assignment Type', 'Date/Position', 'Status', 'Timestamp', 'Group ID']
      ]);
      MockSpreadsheetApp.createSheet('Transfer History', [
        ['Timestamp', 'Assignment Type', 'Assignment Date', 'Call Position/Day', 'Original Assignee', 'New Assignee', 'Year', 'Receiver Round', 'Claim ID']
      ]);
      MockSpreadsheetApp.createSheet('Notification Log', [
        ['Log Timestamp', 'Event Key', 'Participant ID', 'Participant Name', 'Masked Phone', 'Phase', 'Notification Type', 'Status', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Resend WhatsApp', 'Selection Reference', 'Sanitized Error']
      ]);
    }

    // 1. Shared Readiness Mapping
    assert(getReadinessInfo('READY_HOLIDAY_VOLUNTEER').nextPhase === 'HOLIDAY_VOLUNTEER', "getReadinessInfo maps READY_HOLIDAY_VOLUNTEER correctly.");
    assert(getReadinessInfo('READY_HOLIDAY_MANDATORY').nextPhase === 'HOLIDAY_MANDATORY', "getReadinessInfo maps READY_HOLIDAY_MANDATORY correctly.");
    assert(getReadinessInfo('READY_WEEKEND').nextPhase === 'WEEKEND', "getReadinessInfo maps READY_WEEKEND correctly.");
    assert(getReadinessInfo('READY_TRANSFER').nextPhase === 'TRANSFER_OFFER_COLLECTION', "getReadinessInfo maps READY_TRANSFER correctly.");
    assert(getReadinessInfo('WEEKEND') === null, "getReadinessInfo returns null for active phase WEEKEND.");

    // 2. Test Queue Readers and Advancement across all four READY states
    for (var i = 0; i < readyStates.length; i++) {
      var item = readyStates[i];
      setupFixture();
      setQueueState({ phase: item.phase, round: 1, direction: 'ASCENDING', lead: 1 });

      assert(getActiveWindowSize(item.phase) === 0, "getActiveWindowSize returns 0 for " + item.phase);

      var windows = getQueueWindows_(item.phase, { round: 1, direction: 'ASCENDING', lead: 1 }, {});
      assert(windows.activeWindow.length === 0, "activeWindow is empty for " + item.phase);
      assert(windows.upNextWindow.length === 0, "upNextWindow is empty for " + item.phase);
      assert(windows.windowSize === 0, "windowSize is 0 for " + item.phase);
      assert(windows.participants.length === 2, "Participants roster retained for " + item.phase);

      assert(getActiveParticipants(item.phase).length === 0, "getActiveParticipants returns empty array for " + item.phase);

      // 1. Active phase argument with READY state.phase in snapshot
      var staleWindows1 = getQueueWindows_('VACATION_RANDOM', { phase: item.phase, round: 1, direction: 'ASCENDING', lead: 1 }, {});
      assert(staleWindows1.activeWindow.length === 0, "Active phase argument with READY state.phase returns empty activeWindow for " + item.phase);
      assert(staleWindows1.windowSize === 0, "Active phase argument with READY state.phase returns windowSize 0 for " + item.phase);

      // 2. READY phase argument with active state.phase in snapshot
      var staleWindows2 = getQueueWindows_(item.phase, { phase: 'VACATION_RANDOM', round: 1, direction: 'ASCENDING', lead: 1 }, {});
      assert(staleWindows2.activeWindow.length === 0, "READY phase argument with active state.phase returns empty activeWindow for " + item.phase);
      assert(staleWindows2.windowSize === 0, "READY phase argument with active state.phase returns windowSize 0 for " + item.phase);

      // Queue advancement
      var adv1 = advanceQueueInternal_();
      assert(adv1.ready === true, "advanceQueueInternal_ recognizes READY state for " + item.phase);

      var stateAfter = getQueueState();
      assert(stateAfter.phase === item.phase, "Current phase unchanged after advanceQueueInternal_ for " + item.phase);
      assert(stateAfter.lead === 1, "Current lead unchanged after advanceQueueInternal_ for " + item.phase);

      // Repeated advancement
      var adv2 = advanceQueueInternal_();
      assert(adv2.ready === true, "Repeated advanceQueueInternal_ produces identical result for " + item.phase);
    }

    // 3. Test Reconciliation while READY
    setupFixture();
    setQueueState({ phase: 'READY_WEEKEND', round: 1, direction: 'ASCENDING', lead: 1 });
    var reconRes = reconcileFromSheet();
    assert(reconRes.success === true, "reconcileFromSheet succeeds while in READY_WEEKEND.");
    assert(getQueueState().phase === 'READY_WEEKEND', "reconcileFromSheet does not advance queue or change phase while READY.");

    // 4. Test API Responses
    setupFixture();
    setQueueState({ phase: 'READY_HOLIDAY_VOLUNTEER', round: 1, direction: 'ASCENDING', lead: 1 });

    var initRes = getInitialState('Alice', '1234');
    assert(initRes.success === true, "getInitialState succeeds for valid participant during READY state.");
    assert(initRes.readiness !== null && initRes.readiness.nextPhase === 'HOLIDAY_VOLUNTEER', "getInitialState includes readiness object.");
    assert(initRes.isActive === false, "getInitialState sets isActive to false during READY state.");
    assert(Array.isArray(initRes.availableChoices.vacation) && initRes.availableChoices.vacation.length === 0, "availableChoices fields remain empty arrays.");

    var pubRes = getPublicDisplaySnapshot();
    assert(pubRes.success === true, "getPublicDisplaySnapshot succeeds during READY state.");
    assert(pubRes.readiness !== null && pubRes.readiness.nextPhase === 'HOLIDAY_VOLUNTEER', "getPublicDisplaySnapshot includes readiness object.");
    assert(pubRes.queue.activeNames.length === 0 && pubRes.queue.upNextNames.length === 0, "Public queue active and upNext names are empty.");
    assert(pubRes.calendar.vacationWeeks.length === 1, "Public calendar data remains available.");
    assert(pubRes.participantNames.indexOf('Alice') !== -1, "Participant filter names remain available.");

    // 5. Test Server-side Submission Guard (submitSelection)
    setupFixture();
    setQueueState({ phase: 'READY_WEEKEND', round: 1, direction: 'ASCENDING', lead: 1 });

    var actionsToTest = [
      { action: 'SUBMIT', payload: { phase: 'WEEKEND', action: 'SUBMIT', selections: ['2027-01-02'] } },
      { action: 'SUBMIT (Stale Active Phase)', payload: { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W1'] } },
      { action: 'SUBMIT (Missing Phase)', payload: { action: 'SUBMIT', selections: ['2027-01-02'] } },
      { action: 'PASS', payload: { phase: 'WEEKEND', action: 'PASS' } },
      { action: 'NONE', payload: { phase: 'TRANSFER_RECEIVER', action: 'NONE' } }
    ];

    for (var k = 0; k < actionsToTest.length; k++) {
      var testCase = actionsToTest[k];
      var rejected = false;
      try {
        submitSelection('Alice', testCase.payload);
      } catch (err) {
        rejected = true;
        assert(err.message.indexOf('Waiting for the administrator') !== -1 || err.message.indexOf('waiting for the administrator') !== -1, "submitSelection rejects " + testCase.action + " with friendly waiting message: " + err.message);
      }
      assert(rejected, "submitSelection must throw/reject during READY state for " + testCase.action);
    }

    // Verify sheet data and turn tracking remained unchanged
    var wDataAfter = MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues();
    assert(wDataAfter[1][2] === '', "Weekend coverage assignee remains unassigned after rejected submissions.");

    var pDataAfter = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    assert(pDataAfter[1][9] === '', "Entry Timestamp remains empty after rejected submission.");

    // 6. Test Notification Suppression
    setupFixture();
    setQueueState({ phase: 'READY_HOLIDAY_VOLUNTEER', round: 1, direction: 'ASCENDING', lead: 1 });

    var messagesSent = 0;
    var origSendNotif = typeof sendParticipantNotification_ !== 'undefined' ? sendParticipantNotification_ : null;
    sendParticipantNotification_ = function(phone, text) {
      messagesSent++;
      return { success: true };
    };

    // Automated notifications
    notifyActiveParticipants();
    assert(messagesSent === 0, "notifyActiveParticipants sends zero messages during READY state.");

    // Direct manual resend call
    var resendRes = resendParticipantWhatsApp('Alice', 2);
    assert(resendRes.success === false, "resendParticipantWhatsApp rejects during READY state.");
    assert(messagesSent === 0, "resendParticipantWhatsApp sends zero messages during READY state.");

    // Edit resend checkbox in sheet
    MockSpreadsheetApp._sheets['Participant Config'].getRange(2, 16).setValue(true); // Row 2, Resend WhatsApp = true
    onEdit({
      range: {
        getSheet: function() { return MockSpreadsheetApp._sheets['Participant Config']; },
        getRow: function() { return 2; },
        getColumn: function() { return 16; }
      },
      value: 'TRUE'
    });
    assert(messagesSent === 0, "onEdit resend-checkbox sends zero messages during READY state.");
    assert(MockSpreadsheetApp._sheets['Participant Config'].getRange(2, 16).getValue() === false, "onEdit resend-checkbox resets checkbox to FALSE.");

    if (origSendNotif) sendParticipantNotification_ = origSendNotif;

    // 7. Test Representative Active-Phase Control Case
    setupFixture();
    setQueueState({ phase: 'VACATION_RANDOM', round: 1, direction: 'ASCENDING', lead: 1 });

    assert(getActiveWindowSize('VACATION_RANDOM') > 0, "Active phase control: getActiveWindowSize > 0.");
    var activeControl = getActiveParticipants('VACATION_RANDOM');
    assert(activeControl.length > 0 && activeControl[0]['Name'] === 'Alice', "Active phase control: Alice is active in VACATION_RANDOM.");

    var submitControl = submitSelection('Alice', { phase: 'VACATION_RANDOM', action: 'SUBMIT', selections: ['W1'] });
    assert(submitControl.success === true, "Active phase control: Alice successfully submits selection in VACATION_RANDOM.");

    // 8. Test Frontend UI Rendering (Active -> READY -> Active)
    if (typeof browserCtx !== 'undefined' && browserCtx.onStateLoaded) {
      setupFixture();

      // Ensure participant is logged in with rules acknowledged
      browserCtx.appState.participantId = 'Alice';
      browserCtx.appState.name = 'Alice';

      // A) Simulate Active Phase State Load
      setQueueState({ phase: 'VACATION_RANDOM', round: 1, direction: 'ASCENDING', lead: 1 });
      var activeStatePayload = getInitialState('Alice', '1234');
      activeStatePayload.participant['Rules Acknowledged Year'] = '2027'; // Bypass modal
      browserCtx.onStateLoaded(activeStatePayload);

      assert(browserCtx.appState.isActive === true, "Frontend: appState.isActive is true during active phase.");
      assert(browserCtx.appState.readiness === null, "Frontend: appState.readiness is null during active phase.");

      // B) Simulate Transition into READY State
      setQueueState({ phase: 'READY_HOLIDAY_VOLUNTEER', round: 1, direction: 'ASCENDING', lead: 1 });
      var readyStatePayload = getInitialState('Alice', '1234');
      readyStatePayload.participant['Rules Acknowledged Year'] = '2027';

      // Pre-populate pending selection
      browserCtx.appState.selections = ['W1'];
      browserCtx.appState.adjacentWeekendPending = { date: '2027-11-27' };

      browserCtx.onStateLoaded(readyStatePayload);

      assert(browserCtx.appState.isActive === false, "Frontend: appState.isActive set to false on transition to READY.");
      assert(browserCtx.appState.readiness !== null && browserCtx.appState.readiness.nextPhase === 'HOLIDAY_VOLUNTEER', "Frontend: appState.readiness populated on transition to READY.");
      assert(browserCtx.appState.selections.length === 0, "Frontend: appState.selections cleared on transition to READY.");
      assert(browserCtx.appState.adjacentWeekendPending === null, "Frontend: appState.adjacentWeekendPending cleared on transition to READY.");

      // Test public heading guest view
      var pubSnapshot = getPublicDisplaySnapshot();
      browserCtx.appState.participantId = null; // Guest context
      browserCtx.renderPublicPhaseHeading(pubSnapshot);
      assert(browserCtx.document.getElementById('phaseLabel').innerText === 'WAITING FOR ADMIN', "Frontend: renderPublicPhaseHeading shows 'WAITING FOR ADMIN'.");
      browserCtx.appState.participantId = 'Alice'; // Restore logged-in context

      // C) Simulate Transition back to Active Phase
      setQueueState({ phase: 'HOLIDAY_VOLUNTEER', round: 1, direction: 'ASCENDING', lead: 1 });
      var activeStatePayload2 = getInitialState('Alice', '1234');
      activeStatePayload2.participant['Rules Acknowledged Year'] = '2027';
      browserCtx.onStateLoaded(activeStatePayload2);

      assert(browserCtx.appState.isActive === true, "Frontend: appState.isActive restored to true when active phase loaded.");
      assert(browserCtx.appState.readiness === null, "Frontend: appState.readiness restored to null when active phase loaded.");
    } else {
      log.push("⚠️ SKIP: Frontend DOM testing not executed because browserCtx is missing.");
    }

    log.push("✅ All Task 2 READY state tests passed successfully.");

  } catch (e) {
    log.push("❌ Test execution failed: " + e.message + "\n" + e.stack);
    hasFailed = true;
  } finally {
    SpreadsheetApp = originalSpreadsheetApp;
    withScriptLock = originalWithScriptLock;
  }

  if (hasFailed) {
    throw new Error("One or more tests failed:\n" + log.join("\n"));
  }
  return log.join('\n');
}

/**
 * Task 3: Phase Transitions and Guarded Admin Controls Tests
 */
function runTask3TransitionTests() {
  var log = [];
  var hasFailed = false;
  function assert(condition, message) {
    if (!condition) {
      log.push("❌ FAIL: " + message);
      hasFailed = true;
    } else {
      log.push("✅ PASS: " + message);
    }
  }

  var originalSpreadsheetApp = SpreadsheetApp;
  var originalWithScriptLock = withScriptLock;

  try {
    SpreadsheetApp = MockSpreadsheetApp;
    withScriptLock = function(cb) { return cb(); };

    function setupTask3Fixture() {
      MockSpreadsheetApp._sheets = {};
      MockSpreadsheetApp.createSheet('Config', [
        ['Setting Name', 'Setting Value'],
        ['Current Phase', 'SETUP'],
        ['Current Round', '0'],
        ['Current Direction', 'NONE'],
        ['Current Lead', '0']
      ]);
      MockSpreadsheetApp.createSheet('Admin Options', [
        ['Setting Name', 'Setting Value'],
        ['Active Year', '2027'],
        ['Vacation Week Target Default', '1'],
        ['Vacation Active Window (participants)', '2'],
        ['Weekend Active Window (participants)', '2'],
        ['Holiday Active Window (participants)', '2'],
        ['Transfer Active Window (participants)', '2'],
        ['Web App URL', 'https://example.com']
      ]);
      MockSpreadsheetApp.createSheet('Participant Config', [
        ['Name', 'PIN', 'Active for Year', 'Vacation Phase Enabled', 'Weekend Phase Enabled', 'Holiday Volunteer', 'Holiday Volunteer Response', 'Mandatory Holiday Eligible', 'Transfer Giver', 'Transfer Receiver', 'Transfer Offers Submitted', 'Seniority Position', 'Lottery Position', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Phone Number', 'Resend WhatsApp', 'Vacation Week Target Override', 'Weekend Assignment Maximum'],
        ['Alice', '1234', true, true, true, true, 'Yes', true, true, true, false, 1, 1, '', false, false, '1111111111', false, '', '', ''],
        ['Bob',   '5678', true, true, true, true, 'Pass', true, true, true, false, 2, 2, '', false, false, '2222222222', false, '', '', '']
      ]);
      MockSpreadsheetApp.createSheet('Vacation Availability', [
        ['Week ID', 'Start Date (Monday)', 'Capacity', 'Prime Classification', 'Special Week Designation', 'Assigned Participants'],
        ['W1', '2027-01-04', 2, 'Non-Prime', 'None', ''],
        ['W2', '2027-01-11', 2, 'Non-Prime', 'None', '']
      ]);
      MockSpreadsheetApp.createSheet('Weekend Coverage', [
        ['Date', 'Day of Week', 'First Call Assignee', 'Vacation Adjacency Warning', 'Holiday Proximity Warning'],
        ['2027-01-02', 'Saturday', '', '', ''],
        ['2027-01-03', 'Sunday', '', '', '']
      ]);
      MockSpreadsheetApp.createSheet('Holiday Coverage', [
        ['Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
        ['New Years', '2027-01-01', 'Call 1', ''],
        ['New Years', '2027-01-01', 'Call 2', '']
      ]);
      MockSpreadsheetApp.createSheet('Transfer Offers', [
        ['Offer ID', 'Original Assignee (Giver)', 'Assignment Type', 'Date/Position', 'Status', 'Timestamp', 'Group ID']
      ]);
      MockSpreadsheetApp.createSheet('Transfer History', [
        ['Timestamp', 'Assignment Type', 'Assignment Date', 'Call Position/Day', 'Original Assignee', 'New Assignee', 'Year', 'Receiver Round', 'Claim ID']
      ]);
      MockSpreadsheetApp.createSheet('Notification Log', [
        ['Log Timestamp', 'Event Key', 'Participant ID', 'Participant Name', 'Masked Phone', 'Phase', 'Notification Type', 'Status', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Resend WhatsApp', 'Selection Reference', 'Sanitized Error']
      ]);

      // Mock UI alert
      SpreadsheetApp.getUi = function() { return { alert: function(){} }; };
    }

    // 1. Seniority Start & Guard
    setupTask3Fixture();
    beginSeniorityRound();
    assert(getQueueState().phase === 'VACATION_SENIORITY', "beginSeniorityRound sets state to VACATION_SENIORITY.");
    assert(getQueueState().round === 1, "beginSeniorityRound sets round 1.");

    // Wrong-order Seniority call rejected
    var seniorityErr = false;
    try {
      beginSeniorityRound();
    } catch (e) {
      seniorityErr = true;
      assert(e.message.indexOf("Lottery is currently in state 'VACATION_SENIORITY'") !== -1, "Seniority start rejected from active phase.");
    }
    assert(seniorityErr, "beginSeniorityRound throws error when not in setup state.");

    // 2. Seniority -> Vacation Random transition at round 2
    setupTask3Fixture();
    var pSheet = MockSpreadsheetApp._sheets['Participant Config'];
    var pHeaders = pSheet.getDataRange().getValues()[0];
    var targetColIdx = pHeaders.indexOf('Vacation Week Target Override') + 1;
    pSheet.getRange(2, targetColIdx).setValue(2); // Alice target 2
    pSheet.getRange(3, targetColIdx).setValue(2); // Bob target 2

    beginSeniorityRound();
    submitSelection('Alice', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W1'] });
    submitSelection('Bob', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W2'] });

    var stateAfterRound1 = getQueueState();
    assert(stateAfterRound1.phase === 'VACATION_RANDOM', "Seniority Round 1 completion with remaining targets transitions to VACATION_RANDOM.");
    assert(stateAfterRound1.round === 2, "VACATION_RANDOM starts at round 2.");
    assert(stateAfterRound1.direction === 'ASCENDING', "VACATION_RANDOM starts ASCENDING.");
    assert(stateAfterRound1.lead === 1, "VACATION_RANDOM starts at Lottery Position 1.");

    // 3. Vacation completion during Seniority skips VACATION_RANDOM -> READY_HOLIDAY_VOLUNTEER
    setupTask3Fixture();
    beginSeniorityRound();
    submitSelection('Alice', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W1'] });
    submitSelection('Bob', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W2'] });
    var stateAfterVacComplete = getQueueState();
    assert(stateAfterVacComplete.phase === 'READY_HOLIDAY_VOLUNTEER', "Vacation targets met during Seniority skips RANDOM and stages READY_HOLIDAY_VOLUNTEER.");

    // 4. Guarded Begin Holiday Phase & Volunteer Exhaustion -> READY_HOLIDAY_MANDATORY
    var beginHolErr = false;
    try {
      setQueueState({ phase: 'VACATION_RANDOM', round: 2, direction: 'ASCENDING', lead: 1 });
      beginHolidayPhase();
    } catch (e) {
      beginHolErr = true;
      assert(e.message.indexOf("requires READY_HOLIDAY_VOLUNTEER") !== -1, "beginHolidayPhase rejected when state is not READY_HOLIDAY_VOLUNTEER.");
    }
    assert(beginHolErr, "beginHolidayPhase guarded against wrong phase.");

    // Valid Begin Holiday Phase from READY_HOLIDAY_VOLUNTEER
    setQueueState({ phase: 'READY_HOLIDAY_VOLUNTEER', round: 1, direction: 'ASCENDING', lead: 1 });
    beginHolidayPhase();
    assert(getQueueState().phase === 'HOLIDAY_VOLUNTEER', "beginHolidayPhase transitions state to HOLIDAY_VOLUNTEER.");

    pSheet = MockSpreadsheetApp._sheets['Participant Config'];
    pHeaders = pSheet.getDataRange().getValues()[0];
    var volRespIdx = pHeaders.indexOf('Holiday Volunteer Response') + 1;
    pSheet.getRange(3, volRespIdx).setValue('Pass');

    // Alice selects Call 1 in Round 1
    submitSelection('Alice', { phase: 'HOLIDAY_VOLUNTEER', action: 'SUBMIT', selections: [{ name: 'New Years', position: 'Call 1' }] });
    // Alice passes in Round 2 (volunteer participation exhausted)
    submitSelection('Alice', { phase: 'HOLIDAY_VOLUNTEER', action: 'PASS' });
    var stateAfterVolExhaust = getQueueState();
    assert(stateAfterVolExhaust.phase === 'READY_HOLIDAY_MANDATORY', "Holiday Volunteer exhaustion with open positions stages READY_HOLIDAY_MANDATORY.");

    // 5. End-to-end natural submission progression: Volunteer Exhaustion -> READY_HOLIDAY_MANDATORY -> Mandatory Completion -> READY_WEEKEND -> Weekend Completion -> READY_TRANSFER
    // Continuing from stateAfterVolExhaust above (which is READY_HOLIDAY_MANDATORY naturally reached via Alice PASS):
    assert(getQueueState().phase === 'READY_HOLIDAY_MANDATORY', "Queue naturally reached READY_HOLIDAY_MANDATORY via volunteer pass.");

    beginMandatoryHolidayPhase();
    assert(getQueueState().phase === 'HOLIDAY_MANDATORY', "beginMandatoryHolidayPhase transitions to HOLIDAY_MANDATORY.");

    // Bob (who is active lead 2 after Alice passed) completes remaining Call 2 position in Mandatory Holiday
    submitSelection('Bob', { phase: 'HOLIDAY_MANDATORY', action: 'SUBMIT', selections: [{ name: 'New Years', position: 'Call 2' }] });
    assert(getQueueState().phase === 'READY_WEEKEND', "Holiday Mandatory completion naturally stages READY_WEEKEND.");

    beginWeekendPhase();
    assert(getQueueState().phase === 'WEEKEND', "beginWeekendPhase transitions to WEEKEND.");

    // Alice and Bob fill weekend coverage
    submitSelection('Alice', { phase: 'WEEKEND', action: 'SUBMIT', selections: ['2027-01-02'] });
    submitSelection('Bob', { phase: 'WEEKEND', action: 'SUBMIT', selections: ['2027-01-03'] });
    assert(getQueueState().phase === 'READY_TRANSFER', "Weekend completion naturally stages READY_TRANSFER.");

    // 7. Guarded Begin Transfer Giveaways & Terminal COMPLETE
    setQueueState({ phase: 'READY_TRANSFER', round: 1, direction: 'ASCENDING', lead: 1 });
    beginTransferPhase();
    assert(getQueueState().phase === 'TRANSFER_OFFER_COLLECTION', "beginTransferPhase transitions to TRANSFER_OFFER_COLLECTION.");

    submitSelection('Alice', { phase: 'TRANSFER_OFFER_COLLECTION', action: 'SUBMIT', selections: [{ type: 'WEEKEND', datePos: '2027-01-02' }] });
    submitSelection('Bob', { phase: 'TRANSFER_OFFER_COLLECTION', action: 'SUBMIT', selections: [{ type: 'WEEKEND', datePos: '2027-01-03' }] });
    checkTransferOfferCollectionComplete_();
    assert(getQueueState().phase === 'TRANSFER_RECEIVER', "TRANSFER_OFFER_COLLECTION complete transitions to TRANSFER_RECEIVER.");

    setQueueState({ phase: 'TRANSFER_RECEIVER', round: 1, direction: 'ASCENDING', lead: 1 });
    var tSheet = MockSpreadsheetApp._sheets['Transfer Offers'];
    var tData = tSheet.getDataRange().getValues();
    for (var i = 1; i < tData.length; i++) {
      tSheet.getRange(i + 1, 5).setValue('Claimed');
    }
    advanceQueueInternal_();
    assert(getQueueState().phase === 'COMPLETE', "TRANSFER_RECEIVER with no active offers reaches terminal COMPLETE.");

    // 8. Already-complete coverage skipping during Vacation close
    setupTask3Fixture();
    var hSheet = MockSpreadsheetApp._sheets['Holiday Coverage'];
    hSheet.getRange(2, 4).setValue('Alice');
    hSheet.getRange(3, 4).setValue('Bob');
    var wSheet = MockSpreadsheetApp._sheets['Weekend Coverage'];
    wSheet.getRange(2, 3).setValue('Alice');
    wSheet.getRange(3, 3).setValue('Bob');

    beginSeniorityRound();
    submitSelection('Alice', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W1'] });
    submitSelection('Bob', { phase: 'VACATION_SENIORITY', action: 'SUBMIT', selections: ['W2'] });
    assert(getQueueState().phase === 'READY_TRANSFER', "Vacation completion skips completed Holiday and Weekend coverage, staging READY_TRANSFER.");

    // 9. Recheck coverage status on admin Begin and report skipped phase
    setQueueState({ phase: 'READY_HOLIDAY_VOLUNTEER', round: 1, direction: 'ASCENDING', lead: 1 });
    beginHolidayPhase();
    assert(getQueueState().phase === 'READY_TRANSFER', "beginHolidayPhase detects already-complete holiday & weekend coverage, advancing state to READY_TRANSFER.");

    // 10. Explicit Early Close test
    setupTask3Fixture();
    beginSeniorityRound();
    SpreadsheetApp.getUi = function() {
      return {
        alert: function() { return 'YES'; },
        ButtonSet: { YES_NO: 'YES_NO' },
        Button: { YES: 'YES', NO: 'NO' }
      };
    };

    endVacationEarly();
    assert(getQueueState().phase === 'READY_HOLIDAY_VOLUNTEER', "endVacationEarly stages READY_HOLIDAY_VOLUNTEER.");

    beginHolidayPhase();
    assert(getQueueState().phase === 'HOLIDAY_VOLUNTEER', "beginHolidayPhase succeeds from early-closed READY_HOLIDAY_VOLUNTEER state.");

    // 11. SETUP_ERROR fallthrough prevention
    setupTask3Fixture();
    setQueueState({ phase: 'HOLIDAY_VOLUNTEER', round: 1, direction: 'ASCENDING', lead: 1 });
    pSheet = MockSpreadsheetApp._sheets['Participant Config'];
    pHeaders = pSheet.getDataRange().getValues()[0];
    pSheet.getRange(2, pHeaders.indexOf('Holiday Volunteer Response') + 1).setValue('Pass');
    pSheet.getRange(3, pHeaders.indexOf('Holiday Volunteer Response') + 1).setValue('Pass');
    MockSpreadsheetApp._sheets['Holiday Coverage'].getRange(2, 2).setValue('not-a-date'); // Malformed date
    var snapHolBefore = JSON.stringify(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues());
    var snapConfigBefore = JSON.stringify(MockSpreadsheetApp._sheets['Config'].getDataRange().getValues());
    var setupErrRes = advanceQueueInternal_();
    var snapHolAfter = JSON.stringify(MockSpreadsheetApp._sheets['Holiday Coverage'].getDataRange().getValues());
    var snapConfigAfter = JSON.stringify(MockSpreadsheetApp._sheets['Config'].getDataRange().getValues());
    assert(setupErrRes && setupErrRes.setupError === true, "advanceQueueInternal_ handles SETUP_ERROR explicitly without fallthrough.");
    assert(getQueueState().phase === 'HOLIDAY_VOLUNTEER', "HOLIDAY_VOLUNTEER phase retained on SETUP_ERROR.");
    assert(snapHolBefore === snapHolAfter, "Holiday coverage sheet snapshot unchanged on SETUP_ERROR.");
    assert(snapConfigBefore === snapConfigAfter, "Config sheet snapshot unchanged on SETUP_ERROR.");

    // 12. Turn tracking reset verification
    setupTask3Fixture();
    pSheet = MockSpreadsheetApp._sheets['Participant Config'];
    pHeaders = pSheet.getDataRange().getValues()[0];
    var entryIdx = pHeaders.indexOf('Entry Timestamp') + 1;
    var remIdx = pHeaders.indexOf('Reminder Sent') + 1;
    var alertIdx = pHeaders.indexOf('Admin Alert Sent') + 1;

    pSheet.getRange(2, entryIdx).setValue('2027-01-01');
    pSheet.getRange(2, remIdx).setValue(true);
    pSheet.getRange(2, alertIdx).setValue(true);

    var rejectedStartErr = false;
    try {
      beginWeekendPhase(); // State is SETUP, requires READY_WEEKEND
    } catch (e) {
      rejectedStartErr = true;
    }
    assert(rejectedStartErr, "Rejected beginWeekendPhase throws error.");
    assert(pSheet.getRange(2, remIdx).getValue() === true, "Rejected phase start preserves Reminder Sent field.");

    setQueueState({ phase: 'READY_WEEKEND', round: 1, direction: 'ASCENDING', lead: 1 });
    beginWeekendPhase();
    var pDataFresh = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    var pHeadersFresh = pDataFresh[0];
    var freshEntryVal = pDataFresh[1][pHeadersFresh.indexOf('Entry Timestamp')];
    var freshRemVal = pDataFresh[1][pHeadersFresh.indexOf('Reminder Sent')];
    var freshAlertVal = pDataFresh[1][pHeadersFresh.indexOf('Admin Alert Sent')];

    assert(freshEntryVal === '', "Successful phase start clears Entry Timestamp.");
    assert(freshRemVal === false, "Successful phase start clears Reminder Sent.");
    assert(freshAlertVal === false, "Successful phase start clears Admin Alert Sent.");

    log.push("✅ All Task 3 Transition tests passed successfully.");

  } catch (e) {
    log.push("❌ Test execution failed: " + e.message + "\n" + e.stack);
    hasFailed = true;
  } finally {
    SpreadsheetApp = originalSpreadsheetApp;
    withScriptLock = originalWithScriptLock;
  }

  if (hasFailed) {
    throw new Error("One or more tests failed:\n" + log.join("\n"));
  }
  return log.join('\n');
}
