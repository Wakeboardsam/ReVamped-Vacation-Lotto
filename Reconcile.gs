/**
 * Reconcile.gs - Core Engine for Sheet Reconciliation and State Recovery
 */

/**
 * Reconciles manual sheet edits across all coverage sheets, recalculates
 * validation conflicts, and re-evaluates the queue state.
 * @returns {object} Summary of the reconciliation process
 */
function reconcileFromSheet() {
  return withScriptLock(function() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var conflicts = [];
    var processedCount = 0;

    // 1. Load configuration and valid participants
    var participants = getSheetDataAsObjects('Participant Config');
    var adminOptions = getAdminOptions();
    var defaultVacationCap = parseInt(adminOptions['Vacation Week Target Default']) || 9;

    var validNames = {};
    var participantStats = {};

    for (var i = 0; i < participants.length; i++) {
      var pName = String(participants[i]['Name']).trim();
      if (pName) {
        validNames[pName] = participants[i];
        participantStats[pName] = {
          vacationCount: 0,
          weekendCount: 0,
          holidayCount: 0
        };
      }
    }

    function validateName(name, context) {
      if (!name) return false;
      var trimmed = String(name).trim();
      if (!validNames[trimmed]) {
        conflicts.push("Unknown participant '" + trimmed + "' found in " + context);
        return false;
      }
      return true;
    }

    // 2. Validate and Sum Vacation Availability
    var vData = getSheetDataAsObjects('Vacation Availability');
    var vacationMap = {}; // Maps week ID/Date to assignees for transfer validation
    for (var i = 0; i < vData.length; i++) {
      var row = vData[i];
      var weekId = row['Week ID'];
      var dateRaw = row['Start Date (Monday)'];
      var capacity = parseInt(row['Capacity']) || 4;
      var assigneesStr = String(row['Assigned Participants'] || '').trim();
      var assignees = [];

      if (assigneesStr) {
        assignees = assigneesStr.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
        if (assignees.length > capacity) {
          conflicts.push("Over-capacity vacation week: Week " + weekId + " has " + assignees.length + " assignees (capacity " + capacity + ").");
        }
        for (var j = 0; j < assignees.length; j++) {
          if (validateName(assignees[j], "Vacation Availability (Week " + weekId + ")")) {
            participantStats[assignees[j]].vacationCount++;
          }
        }
      }
      vacationMap[String(weekId).trim()] = assignees;

      // Also map by date string for fallback matching
      var dateStr = normalizeDateKey_(dateRaw);
      if (dateStr) {
        vacationMap[dateStr] = assignees;
      } else {
        conflicts.push("Invalid Vacation Date: '" + String(dateRaw) + "' cannot be normalized.");
      }

      processedCount++;
    }

    // 3. Validate and Sum Weekend Coverage
    var wData = getSheetDataAsObjects('Weekend Coverage');
    var weekendMap = {}; // Maps date to assignee for transfer validation
    var weekendTracker = {}; // To detect same weekend dupes
    for (var i = 0; i < wData.length; i++) {
      var row = wData[i];
      var dateRaw = row['Date'];
      var assignee = String(row['First Call Assignee'] || '').trim();

      var dateStr = normalizeDateKey_(dateRaw);
      if (!dateStr) {
        conflicts.push("Invalid Weekend Date: '" + String(dateRaw) + "' cannot be normalized.");
      } else if (assignee) {
        if (validateName(assignee, "Weekend Coverage (" + dateStr + ")")) {
          participantStats[assignee].weekendCount++;
        }
        weekendMap[dateStr] = assignee;

        var weekendId = getWeekendKey_(dateStr);
        if (weekendId) {
          if (!weekendTracker[weekendId]) {
            weekendTracker[weekendId] = {};
          }
          if (weekendTracker[weekendId][assignee]) {
            conflicts.push("Duplicate weekend assignment: '" + assignee + "' is assigned multiple days on the weekend of " + weekendId + ".");
          }
          weekendTracker[weekendId][assignee] = true;
        }
      }
      processedCount++;
    }

    // 4. Validate and Sum Holiday Coverage
    var hData = getSheetDataAsObjects('Holiday Coverage');
    var holidayMap = {}; // Maps "Name - Position" to assignee for transfer validation
    var holidayTracker = {}; // Track by holiday name
    for (var i = 0; i < hData.length; i++) {
      var row = hData[i];
      var holName = row['Holiday Name'];
      var pos = row['Call Position (Call 1 / Call 2)'];
      var assignee = String(row['Assigned Participant'] || '').trim();

      if (assignee) {
        if (validateName(assignee, "Holiday Coverage (" + holName + " - " + pos + ")")) {
          participantStats[assignee].holidayCount++;
        }
        holidayMap[holName + ' - ' + pos] = assignee;

        if (!holidayTracker[holName]) {
          holidayTracker[holName] = {};
        }
        if (holidayTracker[holName][assignee]) {
          conflicts.push("Illegal same-person holiday position: '" + assignee + "' is assigned to multiple calls for " + holName + ".");
        }
        holidayTracker[holName][assignee] = true;
      }
      processedCount++;
    }

    // 5. Check Participant Target Capacities
    for (var pName in participantStats) {
      if (participantStats.hasOwnProperty(pName)) {
        var pData = validNames[pName];
        var stats = participantStats[pName];

        var vacTarget = pData['Vacation Week Target Override'] !== '' ? parseInt(pData['Vacation Week Target Override']) : defaultVacationCap;
        var wkTarget = pData['Weekend Assignment Maximum'] !== '' ? parseInt(pData['Weekend Assignment Maximum']) : 999;

        if (stats.vacationCount > vacTarget) {
          conflicts.push("Participant over-capacity: '" + pName + "' has " + stats.vacationCount + " vacation weeks (Target: " + vacTarget + ").");
        }
        if (stats.weekendCount > wkTarget) {
          conflicts.push("Participant over-capacity: '" + pName + "' has " + stats.weekendCount + " weekend assignments (Max: " + wkTarget + ").");
        }
      }
    }

    // 6. Validate Transfer Offers
    var tData = getSheetDataAsObjects('Transfer Offers');
    for (var i = 0; i < tData.length; i++) {
      var row = tData[i];
      var offerId = row['Offer ID'];
      var giver = String(row['Original Assignee (Giver)'] || '').trim();
      var type = String(row['Assignment Type'] || '').trim();
      var datePos = String(row['Date/Position'] || '').trim();
      var status = String(row['Status'] || '').trim();

      if (giver) {
        validateName(giver, "Transfer Offers (Offer ID " + offerId + ")");
      }

      // If the offer is still active (not Claimed), the Giver must still own the assignment
      if (status !== 'Claimed') {
        var ownsAssignment = false;
        var displayDatePos = datePos;

        if (type === 'VACATION') {
          var normV = normalizeDateKey_(datePos);
          if (normV) {
             var assignees = vacationMap[normV] || [];
             ownsAssignment = assignees.indexOf(giver) !== -1;
             displayDatePos = normV;
          }
        } else if (type === 'WEEKEND') {
          var normW = normalizeDateKey_(datePos);
          if (normW) {
             ownsAssignment = weekendMap[normW] === giver;
             displayDatePos = normW;
          }
        } else if (type === 'HOLIDAY') {
          ownsAssignment = holidayMap[datePos] === giver;
        }

        if (!ownsAssignment) {
          conflicts.push("Unmatched transfer record: Offer " + offerId + " from '" + giver + "' for " + type + " (" + displayDatePos + ") is active, but they are not currently assigned to it (or the date is malformed).");
        }
      }
      processedCount++;
    }

    // 7. Re-evaluate Queue State
    // By calling advanceQueue(), if the current Lead's requirement was met via a manual sheet edit,
    // the system will advance the queue to the next eligible person automatically.
    var state = getQueueState();
    if (state.phase !== 'COMPLETE' && state.phase !== 'SETUP_EMPTY') {
       try {
          // If a manual edit fulfilled the current Lead (or multiple leads),
          // advanceQueue() correctly identifies the NEXT eligible person and advances state.
          advanceQueue();
       } catch (err) {
          conflicts.push("Failed to advance queue during reconciliation: " + err.message);
       }
    }

    // Log all conflicts to standard console.warn
    if (conflicts.length > 0) {
      console.warn("Reconciliation Warnings/Conflicts:");
      for (var c = 0; c < conflicts.length; c++) {
        console.warn(" - " + conflicts[c]);
      }
    }

    return {
      success: true,
      processedCount: processedCount,
      conflicts: conflicts,
      statistics: participantStats
    };
  });
}

/**
 * Menu endpoint for Google Sheets UI.
 */
function runReconciliationFromMenu() {
  var ui = SpreadsheetApp.getUi();
  try {
    var result = reconcileFromSheet();
    if (result.conflicts && result.conflicts.length > 0) {
      var msg = "Reconciliation completed with " + result.conflicts.length + " warnings:\n\n";
      for (var i = 0; i < Math.min(result.conflicts.length, 10); i++) {
        msg += "• " + result.conflicts[i] + "\n";
      }
      if (result.conflicts.length > 10) {
        msg += "• ...and " + (result.conflicts.length - 10) + " more.\n";
      }
      ui.alert("Reconciliation Results", msg, ui.ButtonSet.OK);
    } else {
      ui.alert("Reconciliation Results", "Success! No conflicts found. Processed " + result.processedCount + " records.", ui.ButtonSet.OK);
    }
  } catch (error) {
    ui.alert("Reconciliation Error", "An error occurred:\n" + error.message, ui.ButtonSet.OK);
  }
}
