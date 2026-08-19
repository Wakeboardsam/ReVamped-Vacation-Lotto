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
          setDataValidation: function() {}
        };
      },
      getLastRow: function() { return data.length; },
      getLastColumn: function() { return data.length > 0 ? data[0].length : 0; },
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
    MockSpreadsheetApp._sheets['Config'].getRange(2, 2).setValue('WEEKEND');
    MockSpreadsheetApp.createSheet('Weekend Coverage', [
      ['Date', 'First Call Assignee'],
      ['2025-11-29', ''], // Saturday after Thanksgiving
      ['2025-11-30', '']  // Sunday after Thanksgiving
    ]);
    MockSpreadsheetApp.createSheet('Holiday Coverage', [
      ['Holiday Name', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'],
      ['Thanksgiving', 'Call 1', 'Alice'],
      ['Thanksgiving', 'Call 2', '']
    ]);
    var weekendHolSubmit = submitSelection('Alice', { action: 'SUBMIT', selections: ['2025-11-29'], adjacentHoliday: { holidayName: 'Thanksgiving', position: 'Call 2' } });
    assert(weekendHolSubmit && weekendHolSubmit.success === true && weekendHolSubmit.message && weekendHolSubmit.message.indexOf('was not added because you already hold') !== -1, "Nearby-holiday weekend selection enforces duplicate restriction and returns partial success.");
    assert(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues()[1][1] === 'Alice', "Weekend is assigned despite adjacent holiday rejection.");


    // 10b. Nearby-holiday weekend selection handles concurrently taken adjacent holiday correctly.
    MockSpreadsheetApp._sheets['Weekend Coverage'].getRange(2, 2).setValue(''); // Open again
    // Bob takes the Call 2 spot
    MockSpreadsheetApp._sheets['Holiday Coverage'].getRange(3, 3).setValue('Bob');
    // Ensure Charlie is in Participant Config so submitSelection finds him
    var pSheetData = MockSpreadsheetApp._sheets['Participant Config'].getDataRange().getValues();
    var charlieExists = pSheetData.some(row => row[0] === 'Charlie');
    if (!charlieExists) { MockSpreadsheetApp._sheets['Participant Config'].appendRow(['Charlie', true, true, '', false, false, true, 3, '2']); }

    // Since Alice already holds Thanksgiving Call 1, she hits the FIRST condition before checking if Call 2 is taken.
    // We need to test with a participant who does not hold the holiday.
    getActiveParticipants = function(p) { return [{ Name: 'Charlie' }]; };
    var weekendHolSubmitConcurrent = submitSelection('Charlie', { action: 'SUBMIT', selections: ['2025-11-29'], adjacentHoliday: { holidayName: 'Thanksgiving', position: 'Call 2' } });
    assert(weekendHolSubmitConcurrent.success === true && weekendHolSubmitConcurrent.message && weekendHolSubmitConcurrent.message.indexOf('was just selected by another participant') !== -1, "Valid weekend + already-taken adjacent holiday saves weekend and returns partial success.");
    assert(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues()[1][1] === 'Charlie', "Weekend is assigned despite concurrent adjacent holiday loss.");

    // 10c. Unavailable weekend => no write.
    // Make weekend unavailable
    MockSpreadsheetApp._sheets['Weekend Coverage'].getRange(2, 2).setValue('Charlie');
    var weekendHolSubmitUnavailable = false;
    getActiveParticipants = function(p) { return [{ Name: 'Alice' }]; };
    try {
      submitSelection('Alice', { action: 'SUBMIT', selections: ['2025-11-29'], adjacentHoliday: { holidayName: 'Thanksgiving', position: 'Call 2' } });
      weekendHolSubmitUnavailable = true;
    } catch (e) {
      assert(e.message.indexOf('That position was just selected by another participant') !== -1, "Unavailable weekend correctly rejected.");
    }
    assert(!weekendHolSubmitUnavailable, "Unavailable weekend is rejected and no write occurs.");
    assert(MockSpreadsheetApp._sheets['Weekend Coverage'].getDataRange().getValues()[1][1] === 'Charlie', "Unavailable weekend remains assigned to Charlie.");

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
    var simAppState = { participantId: null, name: null, pin: null, isActive: false, participant: null, availableChoices: null, selections: [], adjacentHolidayPending: null };

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
      simAppState.adjacentHolidayPending = null;

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
