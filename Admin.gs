/**
 * Admin.gs - Admin utilities for initialization and randomization
 */

/**
 * Creates custom menus in the Google Sheet UI on open.
 */
function onOpen(e) {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Vacation Lotto')
      .addItem('🔄 Refresh / Reconcile From Sheet', 'runReconciliationFromMenu')
      .addSeparator()
      .addItem('⚙️ Initialize Database Schema', 'setupDatabaseSchema')
      .addItem('🎲 Auto-Fill & Randomize Roster', 'runAutoFillFromMenu')
      .addSeparator()
      .addItem('▶️ Begin Seniority Round', 'beginSeniorityRound')
      .addItem('▶️ Begin Weekend Phase', 'beginWeekendPhase')
      .addItem('▶️ Begin Holiday Phase', 'beginHolidayPhase')
      .addItem('▶️ Begin Transfer Phase', 'beginTransferPhase')
      .addToUi();
}

/**
 * Menu wrapper for auto-fill to prevent NaN target year errors.
 */
function runAutoFillFromMenu() {
  var year = getAdminOptions()['Active Year'] || 2027;
  var participantCount = autoFillAndRandomize(Number(year)) || 0;

  var successMessage = 'Setup completed successfully for ' + year + '.\n\n' +
    '✓ Vacation weeks generated\n' +
    '✓ Weekend coverage dates generated\n' +
    '✓ Official holiday Call 1 and Call 2 positions generated\n' +
    '✓ Soft holiday warning dates generated\n' +
    '✓ Participant Config prepared: ' + participantCount + ' named participants\n' +
    '✓ Active for Year enabled for all named participants\n' +
    '✓ Vacation Phase Enabled for all named participants\n' +
    '✓ Weekend Phase Enabled for all named participants\n' +
    '✓ Mandatory Holiday Eligible enabled for all named participants\n' +
    '✓ Seniority Position assigned 1–' + participantCount + ' from top to bottom\n' +
    '✓ Lottery Position randomized 1–' + participantCount + '\n' +
    '✓ Prime Classification defaulted to Non-Prime\n' +
    '✓ Special Week Designation defaulted to None\n\n' +
    'Before beginning the lottery:\n\n' +
    '• Mark all applicable Prime weeks\n' +
    '• Designate the Spring Break, Thanksgiving, and Christmas weeks\n' +
    '• Review vacation-week capacities\n' +
    '• Confirm all generated vacation, weekend, and holiday dates\n\n' +
    'Important: Running this setup again will clear and regenerate existing date rows, assignments, and administrative adjustments.';

  SpreadsheetApp.getUi().alert(successMessage);
}

/**
 * Transitions phase state to VACATION_SENIORITY and opens Round 1.
 */
function beginSeniorityRound() {
  setQueueState({ phase: 'VACATION_SENIORITY', round: 1, direction: 'ASCENDING', lead: 1 });
  advanceQueue();
  SpreadsheetApp.getUi().alert('Lottery state changed to VACATION_SENIORITY. Seniority Round 1 is now active!');
}

/**
 * Transitions phase state to WEEKEND.
 */
function beginWeekendPhase() {
  return withScriptLock(function() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // -- VALIDATION PHASE --

    // 1. Validate Participant Config
    var pSheet = ss.getSheetByName('Participant Config');
    if (!pSheet) throw new Error("Participant Config sheet not found.");
    var pData = pSheet.getDataRange().getValues();
    if (pData.length < 2) throw new Error("'Participant Config' sheet is missing data.");
    var pHeaders = pData[0];

    var entryColIdx = pHeaders.indexOf('Entry Timestamp') + 1;
    var reminderColIdx = pHeaders.indexOf('Reminder Sent') + 1;
    var alertColIdx = pHeaders.indexOf('Admin Alert Sent') + 1;
    var wpColIdx = pHeaders.indexOf('Weekend Phase Enabled');
    var lpColIdx = pHeaders.indexOf('Lottery Position');

    if (entryColIdx === 0 || reminderColIdx === 0 || alertColIdx === 0 || wpColIdx === -1 || lpColIdx === -1) {
       throw new Error("Missing required headers in 'Participant Config'.");
    }

    var eligibleCount = 0;
    var lotteryPositions = [];
    for (var i = 1; i < pData.length; i++) {
       var wp = pData[i][wpColIdx];
       if (wp === true || wp === 'TRUE') {
          eligibleCount++;
       }
       var lp = pData[i][lpColIdx];
       if (lp !== '' && lp !== undefined && lp !== null) {
          var lpNum = Number(lp);
          if (isNaN(lpNum)) {
             throw new Error("Invalid Lottery Position for participant " + pData[i][pHeaders.indexOf('Name')] + ". Must be numeric.");
          }
          if (lotteryPositions.indexOf(lpNum) !== -1) {
             throw new Error("Duplicate Lottery Position detected: " + lpNum);
          }
          lotteryPositions.push(lpNum);
       }
    }

    if (eligibleCount === 0) {
       throw new Error("No participants are eligible for the Weekend Phase.");
    }
    if (lotteryPositions.indexOf(1) === -1) {
       throw new Error("Missing Lottery Position 1. Ensure participants are randomized.");
    }

    // 2. Validate Vacation Availability
    var vacSheet = ss.getSheetByName('Vacation Availability');
    if (!vacSheet) throw new Error("Missing 'Vacation Availability' sheet.");
    var vacData = vacSheet.getDataRange().getValues();
    if (vacData.length < 2) throw new Error("'Vacation Availability' sheet is empty.");
    var vacHeaders = vacData[0];
    var dateColIdx = vacHeaders.indexOf('Start Date (Monday)');
    var assigneesColIdx = vacHeaders.indexOf('Assigned Participants');
    if (dateColIdx === -1 || assigneesColIdx === -1) {
       throw new Error("Missing required headers in 'Vacation Availability' sheet.");
    }

    // 3. Validate Weekend Coverage
    var weekendSheet = ss.getSheetByName('Weekend Coverage');
    if (!weekendSheet) throw new Error("Missing 'Weekend Coverage' sheet.");
    var weekendData = weekendSheet.getDataRange().getValues();
    if (weekendData.length < 2) throw new Error("'Weekend Coverage' sheet is empty.");
    var weekendHeaders = weekendData[0];
    var wDateColIdx = weekendHeaders.indexOf('Date');
    var wAdjColIdx = weekendHeaders.indexOf('Vacation Adjacency Warning');
    if (wDateColIdx === -1 || wAdjColIdx === -1) {
       throw new Error("Missing required headers in 'Weekend Coverage' sheet.");
    }

    // -- CALCULATION PHASE --
    var adjacencyMap = {};
    for (var i = 1; i < vacData.length; i++) {
      var rawDate = vacData[i][dateColIdx];
      var assigneesStr = String(vacData[i][assigneesColIdx] || '').trim();
      if (!rawDate || !assigneesStr) continue;

      var assignees = assigneesStr.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
      if (assignees.length === 0) continue;

      // Safely parse YYYY-MM-DD instead of relying on new Date('YYYY-MM-DD')
      var startDate;
      if (rawDate instanceof Date) {
        startDate = new Date(rawDate.getTime());
      } else {
        var parts = String(rawDate).split('-');
        if (parts.length === 3) {
           startDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
           continue; // unparseable
        }
      }

      // Sat/Sun before
      var satBefore = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 2);
      var sunBefore = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 1);

      // Sat/Sun after end Friday (Friday is startDate + 4)
      var satAfter = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 5);
      var sunAfter = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6);

      var adjDates = [formatDate(satBefore), formatDate(sunBefore), formatDate(satAfter), formatDate(sunAfter)];

      for (var j = 0; j < adjDates.length; j++) {
        var dStr = adjDates[j];
        if (!adjacencyMap[dStr]) adjacencyMap[dStr] = [];
        for (var k = 0; k < assignees.length; k++) {
          var name = assignees[k];
          if (adjacencyMap[dStr].indexOf(name) === -1) {
            adjacencyMap[dStr].push(name);
          }
        }
      }
    }

    // -- WRITE PHASE --

    // 1. Reset Participant Config tracking fields
    for (var i = 1; i < pData.length; i++) {
      var row = i + 1;
      pSheet.getRange(row, entryColIdx).clearContent();
      pSheet.getRange(row, reminderColIdx).setValue(false);
      pSheet.getRange(row, alertColIdx).setValue(false);
    }

    // 2. Write Weekend Adjacency warnings
    var totalAffectedRows = 0;
    var wUpdates = [];
    for (var i = 1; i < weekendData.length; i++) {
      var wDate = weekendData[i][wDateColIdx];
      if (!wDate) continue;

      var wDateStr = (wDate instanceof Date) ? formatDate(wDate) : String(wDate);
      var namesForDate = adjacencyMap[wDateStr] || [];

      var val = '';
      if (namesForDate.length > 0) {
        val = namesForDate.join(', '); // comma separated exact names
        totalAffectedRows++;
      }

      if (weekendData[i][wAdjColIdx] !== val) {
        wUpdates.push({ row: i + 1, col: wAdjColIdx + 1, val: val });
      }
    }

    for (var i = 0; i < wUpdates.length; i++) {
      weekendSheet.getRange(wUpdates[i].row, wUpdates[i].col).setValue(wUpdates[i].val);
    }

    // 3. Reset Config & Queue State
    setQueueState({
      phase: 'WEEKEND',
      round: 1,
      direction: 'ASCENDING',
      lead: 1
    });

    // 4. Initialize first ACTIVE window
    advanceQueueInternal_();

    // 5. Gather summary
    var activeParticipants = getActiveParticipants('WEEKEND');
    var activeNames = activeParticipants.map(function(p) { return p['Name']; }).join(', ');

    var summary = 'Weekend Phase started successfully.\n\n' +
                  '- Phase: WEEKEND\n' +
                  '- Round: 1\n' +
                  '- Direction: ASCENDING\n' +
                  '- Current Lead: 1\n' +
                  '- Weekend rows given vacation-adjacency warnings: ' + totalAffectedRows + '\n' +
                  '- Participants currently ACTIVE: ' + (activeNames || 'None');

    SpreadsheetApp.getUi().alert(summary);
  });
}

/**
 * Starts the Holiday Phase from Lottery Position 1.
 */
function beginHolidayPhase() {
  setQueueState({
    phase: 'HOLIDAY_VOLUNTEER',
    round: 1,
    direction: 'ASCENDING',
    lead: 1
  });

  advanceQueue();

  SpreadsheetApp.getUi().alert(
    'Holiday Phase started.\n\n' +
    'Round: 1\n' +
    'Direction: ASCENDING\n' +
    'Current Lead: 1'
  );
}

/**
 * Starts the Transfer Phase from Lottery Position 1.
 */
function beginTransferPhase() {
  setQueueState({
    phase: 'TRANSFER_OFFER_COLLECTION',
    round: 1,
    direction: 'ASCENDING',
    lead: 1
  });

  advanceQueue();

  SpreadsheetApp.getUi().alert(
    'Transfer Phase started.\n\n' +
    'Round: 1\n' +
    'Direction: ASCENDING\n' +
    'Current Lead: 1'
  );
}

/**
 * Calculates vacation adjacency and stores participant names in Weekend Coverage.
 */


function autoFillAndRandomize(targetYear) {
  // Fallback to Admin Options setting or 2027 default if no argument is passed
  targetYear = Number(targetYear || getAdminOptions()['Active Year'] || 2027);

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Generate Vacation Weeks
  var vacationSheet = ss.getSheetByName('Vacation Availability');
  if (vacationSheet) {
    var startMonday = getStartMondayForYear(targetYear);
    var endMonday = getEndMondayForYear(targetYear);
    var currentMonday = new Date(startMonday.getTime());
    var vacationData = [];
    var weekId = 1;

    while (currentMonday <= endMonday) {
      vacationData.push([
        weekId,
        formatDate(currentMonday),
        '', // Capacity
        'Non-Prime', // Prime Classification
        'None', // Special Week Designation
        ''  // Assigned Participants
      ]);
      currentMonday.setDate(currentMonday.getDate() + 7);
      weekId++;
    }

    if (vacationData.length > 0) {
      var lastRow = vacationSheet.getLastRow();
      // Clear existing data (keep headers)
      if (lastRow > 1) {
        vacationSheet.getRange(2, 1, lastRow - 1, vacationSheet.getLastColumn()).clearContent();

        // Clear old validations for the specific columns (Prime Classification is col 4, Special Week Designation is col 5)
        vacationSheet.getRange(2, 4, lastRow - 1, 1).clearDataValidations();
        vacationSheet.getRange(2, 5, lastRow - 1, 1).clearDataValidations();
      }
      vacationSheet.getRange(2, 1, vacationData.length, vacationData[0].length).setValues(vacationData);

      // Apply new strict dropdown validations to the newly generated rows
      var primeRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Non-Prime', 'Prime'], true)
        .setAllowInvalid(false)
        .build();
      var specialRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['None', 'Spring Break', 'Thanksgiving', 'Christmas'], true)
        .setAllowInvalid(false)
        .build();

      vacationSheet.getRange(2, 4, vacationData.length, 1).setDataValidation(primeRule);
      vacationSheet.getRange(2, 5, vacationData.length, 1).setDataValidation(specialRule);
    }
  }

  // 2. Generate Official Holidays (Call 1 and Call 2)
  var holidaySheet = ss.getSheetByName('Holiday Coverage');
  var finalHolidayData = []; // Store it to use for weekend generation
  if (holidaySheet) {
    var existingHolidays = {};
    var existingDates = {};
    if (holidaySheet.getLastRow() > 1) {
      var hData = holidaySheet.getDataRange().getValues();
      var hHeaders = hData[0];
      var hNameIdx = hHeaders.indexOf('Holiday Name');
      var hDateIdx = hHeaders.indexOf('Observed Date');
      var hPosIdx = hHeaders.indexOf('Call Position (Call 1 / Call 2)');
      var hAssigneeIdx = hHeaders.indexOf('Assigned Participant');

      if (hNameIdx !== -1 && hPosIdx !== -1 && hAssigneeIdx !== -1 && hDateIdx !== -1) {
         for (var i = 1; i < hData.length; i++) {
           var name = hData[i][hNameIdx];
           var pos = hData[i][hPosIdx];
           var key = name + '|' + pos;
           existingHolidays[key] = hData[i][hAssigneeIdx];

           var rawD = hData[i][hDateIdx];
           if (rawD) existingDates[name] = (rawD instanceof Date) ? formatDate(rawD) : String(rawD);
         }
      }
    }

    var holidays = getHolidaysForYear(targetYear);
    var holidayData = [];
    var processedNames = {};

    // 1. Process existing holidays (standard or custom) to preserve them completely
    for (var hName in existingDates) {
      if (existingDates.hasOwnProperty(hName)) {
        var hDate = existingDates[hName];
        var assignee1 = existingHolidays[hName + '|Call 1'] || '';
        var assignee2 = existingHolidays[hName + '|Call 2'] || '';

        holidayData.push([hName, hDate, 'Call 1', assignee1]);
        holidayData.push([hName, hDate, 'Call 2', assignee2]);

        finalHolidayData.push({ name: hName, dateStr: hDate });
        processedNames[hName] = true;
      }
    }

    // 2. Append any standard holidays missing from the sheet
    for (var hName in holidays) {
      if (holidays.hasOwnProperty(hName) && !processedNames[hName]) {
        var hDate = formatDate(holidays[hName]);

        holidayData.push([hName, hDate, 'Call 1', '']);
        holidayData.push([hName, hDate, 'Call 2', '']);

        finalHolidayData.push({ name: hName, dateStr: hDate });
      }
    }

    if (holidayData.length > 0) {
      if (holidaySheet.getLastRow() > 1) {
        holidaySheet.getRange(2, 1, holidaySheet.getLastRow() - 1, holidaySheet.getLastColumn()).clearContent();
      }
      holidaySheet.getRange(2, 1, holidayData.length, holidayData[0].length).setValues(holidayData);
    }
  }

  // 3. Generate Weekends
  var weekendSheet = ss.getSheetByName('Weekend Coverage');
  if (weekendSheet) {
    var adminOptions = getAdminOptions();
    var proximityStr = adminOptions['Holiday Proximity Range (days)'];
    var proximityRange = (proximityStr !== undefined && proximityStr !== '') ? parseInt(proximityStr) : 3;

    var startDate = new Date(targetYear, 0, 1);
    var endDate = new Date(targetYear, 11, 31);
    var currentDate = new Date(startDate.getTime());
    var weekendData = [];

    while (currentDate <= endDate) {
      var dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
        var holWarning = '';
        var minDiff = Infinity;
        var earliestDate = Infinity;
        var closestHolidayName = '';

        // Local date for distance calc to prevent timezone shifting
        var cDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

        for (var i = 0; i < finalHolidayData.length; i++) {
          var hName = finalHolidayData[i].name;
          var rawDate = finalHolidayData[i].dateStr; // YYYY-MM-DD

          var parts = String(rawDate).split('-');
          if (parts.length !== 3) continue;

          var hLocalDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));

          // UTC math to prevent DST errors
          var utc1 = Date.UTC(cDate.getFullYear(), cDate.getMonth(), cDate.getDate());
          var utc2 = Date.UTC(hLocalDate.getFullYear(), hLocalDate.getMonth(), hLocalDate.getDate());
          var diffTime = Math.abs(utc1 - utc2);
          var diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays <= proximityRange) {
            if (diffDays < minDiff) {
              minDiff = diffDays;
              earliestDate = hLocalDate.getTime();
              closestHolidayName = hName;
            } else if (diffDays === minDiff) {
              // Break ties using earliest holiday date
              if (hLocalDate.getTime() < earliestDate) {
                 earliestDate = hLocalDate.getTime();
                 closestHolidayName = hName;
              }
            }
          }
        }

        if (closestHolidayName) {
           holWarning = closestHolidayName;
        }

        weekendData.push([
          formatDate(currentDate),
          dayOfWeek === 0 ? 'Sunday' : 'Saturday',
          '', // First Call Assignee
          '', // Vacation Adjacency Warning
          holWarning  // Holiday Proximity Warning
        ]);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (weekendData.length > 0) {
      if (weekendSheet.getLastRow() > 1) {
        weekendSheet.getRange(2, 1, weekendSheet.getLastRow() - 1, weekendSheet.getLastColumn()).clearContent();
      }
      weekendSheet.getRange(2, 1, weekendData.length, weekendData[0].length).setValues(weekendData);
    }
  }

  // 4. Generate Soft Holidays
  var softHolidaySheet = ss.getSheetByName('Soft Holiday Warnings');
  if (softHolidaySheet) {
    var softHolidays = getSoftHolidaysForYear(targetYear);
    var softHolidayData = [];

    for (var sName in softHolidays) {
      if (softHolidays.hasOwnProperty(sName)) {
        softHolidayData.push([
          sName,
          formatDate(softHolidays[sName]),
          'TRUE',
          '' // Custom Description
        ]);
      }
    }

    if (softHolidayData.length > 0) {
      if (softHolidaySheet.getLastRow() > 1) {
        softHolidaySheet.getRange(2, 1, softHolidaySheet.getLastRow() - 1, softHolidaySheet.getLastColumn()).clearContent();
      }
      softHolidaySheet.getRange(2, 1, softHolidayData.length, softHolidayData[0].length).setValues(softHolidayData);
    }
  }

  // 5. Setup Participants (Seniority & Lottery Position)
  var participantSheet = ss.getSheetByName('Participant Config');
  var namedParticipantCount = 0;

  if (participantSheet && participantSheet.getLastRow() > 1) {
    var headers = participantSheet.getRange(1, 1, 1, participantSheet.getLastColumn()).getValues()[0];
    var nameIdx = headers.indexOf('Name');
    var activeColIdx = headers.indexOf('Active for Year');
    var vacationEnabledIdx = headers.indexOf('Vacation Phase Enabled');
    var weekendEnabledIdx = headers.indexOf('Weekend Phase Enabled');
    var holidayEnabledIdx = headers.indexOf('Mandatory Holiday Eligible');
    var seniorityPosColIdx = headers.indexOf('Seniority Position');
    var lotteryPosColIdx = headers.indexOf('Lottery Position');

    if (nameIdx !== -1 && activeColIdx !== -1 && vacationEnabledIdx !== -1 && weekendEnabledIdx !== -1 &&
        holidayEnabledIdx !== -1 && seniorityPosColIdx !== -1 && lotteryPosColIdx !== -1) {

      var dataRange = participantSheet.getRange(2, 1, participantSheet.getLastRow() - 1, participantSheet.getLastColumn());
      var data = dataRange.getValues();

      var participantRows = [];

      for (var i = 0; i < data.length; i++) {
        var name = String(data[i][nameIdx] || '').trim();

        if (!name) {
          data[i][seniorityPosColIdx] = '';
          data[i][lotteryPosColIdx] = '';
          continue;
        }

        // Set required checkboxes to boolean true
        data[i][activeColIdx] = true;
        data[i][vacationEnabledIdx] = true;
        data[i][weekendEnabledIdx] = true;
        data[i][holidayEnabledIdx] = true;

        participantRows.push(i);
      }

      namedParticipantCount = participantRows.length;
      var lotteryPositions = [];

      // Generate sequence 1...N for lottery and seniority positions
      for (var position = 1; position <= namedParticipantCount; position++) {
        lotteryPositions.push(position);
      }

      // Shuffle lottery sequence
      for (var i = lotteryPositions.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = lotteryPositions[i];
        lotteryPositions[i] = lotteryPositions[j];
        lotteryPositions[j] = temp;
      }

      // Assign Seniority and Lottery positions to the tracked rows
      for (var k = 0; k < participantRows.length; k++) {
        var rowIndex = participantRows[k];

        data[rowIndex][seniorityPosColIdx] = k + 1;
        data[rowIndex][lotteryPosColIdx] = lotteryPositions[k];
      }

      // Write back to sheet
      dataRange.setValues(data);
    }
  }

  // Set Active Year in Admin Options
  setAdminOptions({ 'Active Year': targetYear });

  sanitizeParticipantConfigSheet();

  return namedParticipantCount;
}

function setupSmsTriggers() {
  // First, delete any existing triggers for this function to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'notifyActiveParticipants') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create a new time-driven trigger
  ScriptApp.newTrigger('notifyActiveParticipants')
    .timeBased()
    .everyMinutes(15)
    .create();

  console.log("SMS notification trigger has been set to run every 15 minutes.");
}

/**
 * Server RPC handler to manually resend an entry SMS to a specific participant.
 * Clears their tracking flags and immediately invokes notifyActiveParticipants().
 * @param {string} participantId - The participant's Name to resend the SMS to.
 */
function resendParticipantSms(participantId) {
  return withScriptLock(function() {
    var pSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Participant Config');
    var pData = pSheet.getDataRange().getValues();
    var pHeaders = pData[0];

    var nameCol = pHeaders.indexOf('Name');
    var entryCol = pHeaders.indexOf('Entry Timestamp') + 1;
    var remCol = pHeaders.indexOf('Reminder Sent') + 1;
    var alertCol = pHeaders.indexOf('Admin Alert Sent') + 1;

    var found = false;

    for (var i = 1; i < pData.length; i++) {
      if (pData[i][nameCol] === participantId) {
        var rowIndex = i + 1;
        pSheet.getRange(rowIndex, entryCol).clearContent();
        pSheet.getRange(rowIndex, remCol).setValue(false);
        pSheet.getRange(rowIndex, alertCol).setValue(false);
        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error("Participant not found for SMS resend.");
    }

    // Trigger notification logic immediately so the entry message is resent
    notifyActiveParticipants();
    return { success: true };
  });
}

/**
 * Responds to sheet edits, specifically looking for the 'Resend SMS' checkbox being checked.
 * Note: Simple onEdit triggers cannot make UrlFetchApp calls, so this assumes the user
 * authorizing the script has set up an installable onEdit trigger, OR we use an installable trigger.
 * But we'll provide the function here.
 * @param {Object} e - The event object.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getName() !== 'Participant Config') return;

  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row < 2) return; // Skip headers

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var resendColIdx = headers.indexOf('Resend SMS') + 1;
  var nameColIdx = headers.indexOf('Name') + 1;

  // If the edited cell is the 'Resend SMS' checkbox and it was set to TRUE
  if (col === resendColIdx && e.value === 'TRUE') {
    var participantId = sheet.getRange(row, nameColIdx).getValue();

    if (participantId) {
      try {
        // Clear flags and resend
        resendParticipantSms(participantId);
      } catch (err) {
        console.error("Failed to resend SMS for " + participantId + ": " + err.message);
      }
    }

    // Always reset the checkbox back to FALSE
    sheet.getRange(row, col).setValue(false);
  }
}
