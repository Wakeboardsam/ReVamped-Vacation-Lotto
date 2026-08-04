/**
 * WebApp.gs - Routing, Server-side RPC handlers for the frontend Web Shell
 */

/**
 * Serves the single universal web application URL
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
      .setTitle('Vacation Lottery System')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Authenticates a participant by Name and PIN
 * @param {string} name
 * @param {string} pin
 * @returns {object} JSON object with success and participant details
 */
function authenticateParticipant(name, pin) {
  var participants = getSheetDataAsObjects('Participant Config');

  for (var i = 0; i < participants.length; i++) {
    var p = participants[i];
    if (String(p['Name']).trim().toLowerCase() === String(name).trim().toLowerCase() &&
        String(p['PIN']).trim() === String(pin).trim()) {

      // Check if active for the year
      if (p['Active for Year'] !== true && p['Active for Year'] !== 'TRUE') {
        throw new Error("User is not active for the current lottery year.");
      }

      return {
        success: true,
        participantId: p['Name'],
        name: p['Name']
      };
    }
  }

  throw new Error("Invalid Name or PIN.");
}

/**
 * Fetches the current state of the application for the given participant
 * @param {string} participantId
 * @returns {object} Application state
 */
function getInitialState(participantId) {
  var adminOptions = getAdminOptions();
  var state = getQueueState();
  var activeYear = adminOptions['Active Year'] || new Date().getFullYear().toString();

  var participants = getSheetDataAsObjects('Participant Config');
  var participant = null;
  for (var i = 0; i < participants.length; i++) {
    if (participants[i]['Name'] === participantId) {
      participant = participants[i];
      break;
    }
  }

  if (!participant) {
    throw new Error("Participant not found");
  }

  // Check active status
  var activeWindow = getActiveParticipants(state.phase);
  var isActive = false;
  for (var i = 0; i < activeWindow.length; i++) {
    if (activeWindow[i]['Name'] === participantId) {
      isActive = true;
      break;
    }
  }

  var response = {
    activeYear: activeYear,
    phase: state.phase,
    round: state.round,
    direction: state.direction,
    participant: participant,
    isActive: isActive,
    availableChoices: {}
  };

  // Populate available choices based on phase
  if (state.phase === 'VACATION_SENIORITY' || state.phase === 'VACATION_RANDOM') {
    response.availableChoices.vacation = getSheetDataAsObjects('Vacation Availability');
  } else if (state.phase === 'WEEKEND') {
    response.availableChoices.weekend = getSheetDataAsObjects('Weekend Coverage');
    response.availableChoices.holiday = getSheetDataAsObjects('Holiday Coverage');
  } else if (state.phase === 'HOLIDAY_VOLUNTEER' || state.phase === 'HOLIDAY_MANDATORY') {
    response.availableChoices.holiday = getSheetDataAsObjects('Holiday Coverage');
  } else if (state.phase === 'TRANSFER_OFFER_COLLECTION') {
    // Stage A: Givers
    var myAssignments = [];

    var vacs = getSheetDataAsObjects('Vacation Availability');
    for (var i = 0; i < vacs.length; i++) {
      if (String(vacs[i]['Assigned Participants']).indexOf(participantId) !== -1) {
        myAssignments.push({ type: 'VACATION', details: vacs[i] });
      }
    }

    var wks = getSheetDataAsObjects('Weekend Coverage');
    for (var i = 0; i < wks.length; i++) {
      if (wks[i]['First Call Assignee'] === participantId) {
        myAssignments.push({ type: 'WEEKEND', details: wks[i] });
      }
    }

    var hols = getSheetDataAsObjects('Holiday Coverage');
    for (var i = 0; i < hols.length; i++) {
      if (hols[i]['Assigned Participant'] === participantId) {
        myAssignments.push({ type: 'HOLIDAY', details: hols[i] });
      }
    }

    response.availableChoices.myAssignments = myAssignments;

  } else if (state.phase === 'TRANSFER_RECEIVER') {
    // Stage B: Receivers
    var offers = getSheetDataAsObjects('Transfer Offers');
    var activeOffers = [];
    for (var i = 0; i < offers.length; i++) {
      if (offers[i]['Status'] !== 'Claimed') {
        activeOffers.push(offers[i]);
      }
    }
    response.availableChoices.transferOffers = activeOffers;
  }

  return response;
}

/**
 * Saves the rules acknowledgment for the year.
 * @param {string} participantId
 * @param {string} volunteerChoice "Yes" or "No"
 * @param {string} transferPref "Offer assignments", "Receive assignments", "Both offer and receive", "Do not participate"
 */
function saveRulesAcknowledgment(participantId, volunteerChoice, transferPref) {
  return withScriptLock(function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Participant Config');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][headers.indexOf('Name')] === participantId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) throw new Error("Participant not found");

    var adminOptions = getAdminOptions();
    var activeYear = adminOptions['Active Year'] || new Date().getFullYear().toString();

    // Determine flags based on preferences
    var volResp = volunteerChoice === "Yes" ? "Yes" : "No";
    var giver = false;
    var receiver = false;

    if (transferPref === "Offer assignments") giver = true;
    else if (transferPref === "Receive assignments") receiver = true;
    else if (transferPref === "Both offer and receive") { giver = true; receiver = true; }

    sheet.getRange(rowIndex, headers.indexOf('Holiday Volunteer Response') + 1).setValue(volResp);
    sheet.getRange(rowIndex, headers.indexOf('Transfer Giver') + 1).setValue(giver);
    sheet.getRange(rowIndex, headers.indexOf('Transfer Receiver') + 1).setValue(receiver);
    sheet.getRange(rowIndex, headers.indexOf('Rules Acknowledged Year') + 1).setValue(activeYear);

    return { success: true };
  });
}

/**
 * Processes a phase selection submission atomically.
 * @param {string} participantId
 * @param {object} selectionData
 */
function submitSelection(participantId, selectionData) {
  return withScriptLock(function() {
    // 1. Verify queue and active status
    var state = getQueueState();
    var phase = state.phase;
    var activeWindow = getActiveParticipants(phase);

    var isActive = false;
    for (var i = 0; i < activeWindow.length; i++) {
      if (activeWindow[i]['Name'] === participantId) {
        isActive = true;
        break;
      }
    }

    if (!isActive) {
      throw new Error("It is not currently your turn.");
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Helper to find participant row
    var pSheet = ss.getSheetByName('Participant Config');
    var pData = pSheet.getDataRange().getValues();
    var pHeaders = pData[0];
    var pRowIdx = -1;
    for (var i = 1; i < pData.length; i++) {
      if (pData[i][pHeaders.indexOf('Name')] === participantId) {
        pRowIdx = i + 1;
        break;
      }
    }
    if (pRowIdx === -1) throw new Error("Participant not found");

    // 2. Route by Phase & Action
    if (selectionData.action === 'PASS' || selectionData.action === 'NONE') {
      if (phase === 'HOLIDAY_VOLUNTEER' || phase === 'HOLIDAY_MANDATORY') {
        pSheet.getRange(pRowIdx, pHeaders.indexOf('Holiday Volunteer Response') + 1).setValue('Pass');
      } else if (phase === 'TRANSFER_RECEIVER') {
        pSheet.getRange(pRowIdx, pHeaders.indexOf('Transfer Receiver') + 1).setValue(false);
      }
      // advance queue
      advanceQueue();
      return { success: true };
    }

    if (selectionData.action === 'SUBMIT') {
      if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
        // Selection data format: { phase: 'VACATION', selections: ['Week ID 1', 'Week ID 2'] }
        var vSheet = ss.getSheetByName('Vacation Availability');
        var vData = vSheet.getDataRange().getValues();
        var vHeaders = vData[0];

        var selectedCount = selectionData.selections.length;
        var primeCount = 0;
        var nonPrimeCount = 0;

        var toUpdate = [];

        for (var s = 0; s < selectedCount; s++) {
          var weekId = selectionData.selections[s];
          var found = false;
          for (var i = 1; i < vData.length; i++) {
            if (vData[i][vHeaders.indexOf('Week ID')] == weekId) { // == to handle strings/numbers
              var cap = parseInt(vData[i][vHeaders.indexOf('Capacity')]) || 4;
              var assigneesStr = String(vData[i][vHeaders.indexOf('Assigned Participants')] || '');
              var assignees = assigneesStr ? assigneesStr.split(',').map(function(n) { return n.trim(); }) : [];

              if (assignees.length >= cap) {
                throw new Error("That position was just selected by another participant. Please try again.");
              }
              if (assignees.indexOf(participantId) !== -1) {
                throw new Error("You already selected this week.");
              }

              var isPrime = String(vData[i][vHeaders.indexOf('Prime Classification')]).toLowerCase() === 'prime';
              if (isPrime) primeCount++; else nonPrimeCount++;

              assignees.push(participantId);
              toUpdate.push({ row: i + 1, assigneesStr: assignees.join(', ') });
              found = true;
              break;
            }
          }
          if (!found) throw new Error("Week " + weekId + " not found.");
        }

        // Write updates
        for (var i = 0; i < toUpdate.length; i++) {
          vSheet.getRange(toUpdate[i].row, vHeaders.indexOf('Assigned Participants') + 1).setValue(toUpdate[i].assigneesStr);
        }

        // If 2 non-prime weeks selected, they skip their next turn
        if (nonPrimeCount === 2) {
          var currentSkipped = parseInt(pData[pRowIdx-1][pHeaders.indexOf('Skipped Turns Remaining')]) || 0;
          pSheet.getRange(pRowIdx, pHeaders.indexOf('Skipped Turns Remaining') + 1).setValue(currentSkipped + 1);
        }

      } else if (phase === 'WEEKEND') {
        // Selection data format: { phase: 'WEEKEND', selections: ['DateStr'] }
        // Selections is an array of dates like '2025-01-04'
        var wSheet = ss.getSheetByName('Weekend Coverage');
        var wData = wSheet.getDataRange().getValues();
        var wHeaders = wData[0];

        // 1. Validate both weekend and adjacent holiday first to ensure atomic updates
        var weekendUpdates = [];
        for (var s = 0; s < selectionData.selections.length; s++) {
          var dateStr = selectionData.selections[s];
          var found = false;
          for (var i = 1; i < wData.length; i++) {
            var rowDate = wData[i][wHeaders.indexOf('Date')];
            if (rowDate instanceof Date) rowDate = formatDate(rowDate);
            if (String(rowDate) === String(dateStr)) {
              if (wData[i][wHeaders.indexOf('First Call Assignee')]) {
                throw new Error("That position was just selected by another participant. Please try again.");
              }
              weekendUpdates.push({row: i + 1, col: wHeaders.indexOf('First Call Assignee') + 1});
              found = true;
              break;
            }
          }
          if (!found) throw new Error("Weekend date not found.");
        }

        // Validate adjacent holiday if included
        var holidayUpdate = null;
        if (selectionData.adjacentHoliday && selectionData.adjacentHoliday.holidayName) {
           var hSheet = ss.getSheetByName('Holiday Coverage');
           var hData = hSheet.getDataRange().getValues();
           var hHeaders = hData[0];
           var hFound = false;
           for (var i = 1; i < hData.length; i++) {
             if (hData[i][hHeaders.indexOf('Holiday Name')] === selectionData.adjacentHoliday.holidayName &&
                 hData[i][hHeaders.indexOf('Call Position (Call 1 / Call 2)')] === selectionData.adjacentHoliday.position) {
                 if (hData[i][hHeaders.indexOf('Assigned Participant')]) {
                    throw new Error("That adjacent holiday was just selected by another participant.");
                 }
                 holidayUpdate = {sheet: hSheet, row: i + 1, col: hHeaders.indexOf('Assigned Participant') + 1};
                 hFound = true;
                 break;
             }
           }
           if (!hFound) throw new Error("Adjacent holiday not found.");
        }

        // 2. Perform updates after all validations pass
        for (var i = 0; i < weekendUpdates.length; i++) {
           wSheet.getRange(weekendUpdates[i].row, weekendUpdates[i].col).setValue(participantId);
        }
        if (holidayUpdate) {
           holidayUpdate.sheet.getRange(holidayUpdate.row, holidayUpdate.col).setValue(participantId);
        }

      } else if (phase === 'HOLIDAY_VOLUNTEER' || phase === 'HOLIDAY_MANDATORY') {
        // selections contains the row index or matching criteria
        var hSheet = ss.getSheetByName('Holiday Coverage');
        var hData = hSheet.getDataRange().getValues();
        var hHeaders = hData[0];

        var selectedItem = selectionData.selections[0]; // e.g. { name: 'Memorial Day', position: 'CALL_2' }
        var found = false;

        for (var i = 1; i < hData.length; i++) {
          if (hData[i][hHeaders.indexOf('Holiday Name')] === selectedItem.name &&
              hData[i][hHeaders.indexOf('Call Position (Call 1 / Call 2)')] === selectedItem.position) {
              if (hData[i][hHeaders.indexOf('Assigned Participant')]) {
                throw new Error("That position was just selected by another participant. Please try again.");
              }
              hSheet.getRange(i + 1, hHeaders.indexOf('Assigned Participant') + 1).setValue(participantId);
              found = true;
              break;
          }
        }
        if (!found) throw new Error("Holiday position not found.");

      } else if (phase === 'TRANSFER_OFFER_COLLECTION') {
        // Stage A Givers: Provide an item to the pool
        var tSheet = ss.getSheetByName('Transfer Offers');
        var offerId = 'OFFER-' + new Date().getTime() + '-' + Math.floor(Math.random()*1000);
        var item = selectionData.selections[0]; // { type: 'VACATION', datePos: 'Week 12' }
        var tData = [offerId, participantId, item.type, item.datePos, 'Active', new Date()];
        tSheet.appendRow(tData);
        // Note: We do NOT remove from original schedule yet!
      } else if (phase === 'TRANSFER_RECEIVER') {
        // Stage B Receivers: Claim an offer
        var tSheet = ss.getSheetByName('Transfer Offers');
        var tData = tSheet.getDataRange().getValues();
        var tHeaders = tData[0];
        var offerId = selectionData.selections[0];

        var originalAssignee = "";
        var assignmentType = "";
        var datePos = "";

        var found = false;
        for (var i = 1; i < tData.length; i++) {
          if (tData[i][tHeaders.indexOf('Offer ID')] === offerId) {
            if (tData[i][tHeaders.indexOf('Status')] === 'Claimed') {
              throw new Error("That offer was just claimed by another participant.");
            }
            originalAssignee = tData[i][tHeaders.indexOf('Original Assignee (Giver)')];
            assignmentType = tData[i][tHeaders.indexOf('Assignment Type')];
            datePos = tData[i][tHeaders.indexOf('Date/Position')];

            // Mark claimed
            tSheet.getRange(i + 1, tHeaders.indexOf('Status') + 1).setValue('Claimed');
            found = true;
            break;
          }
        }
        if (!found) throw new Error("Offer not found.");

        // Update History
        var histSheet = ss.getSheetByName('Transfer History');
        var activeYear = getAdminOptions()['Active Year'] || new Date().getFullYear();
        histSheet.appendRow([new Date(), assignmentType, datePos, '', originalAssignee, participantId, activeYear]);

        // Swap Assignee in main schedule
        if (assignmentType === 'VACATION') {
           var vSheet = ss.getSheetByName('Vacation Availability');
           var vDataAll = vSheet.getDataRange().getValues();
           var vH = vDataAll[0];
           for (var k = 1; k < vDataAll.length; k++) {
              if (String(vDataAll[k][vH.indexOf('Week ID')]) === String(datePos) || String(vDataAll[k][vH.indexOf('Start Date (Monday)')]) === String(datePos)) {
                 var assigneesStr = String(vDataAll[k][vH.indexOf('Assigned Participants')] || '');
                 var assignees = assigneesStr ? assigneesStr.split(',').map(function(x){return x.trim();}) : [];
                 var idx = assignees.indexOf(originalAssignee);
                 if (idx !== -1) {
                    assignees[idx] = participantId;
                    vSheet.getRange(k + 1, vH.indexOf('Assigned Participants') + 1).setValue(assignees.join(', '));
                 }
                 break;
              }
           }
        } else if (assignmentType === 'WEEKEND') {
           var wSheet = ss.getSheetByName('Weekend Coverage');
           var wDataAll = wSheet.getDataRange().getValues();
           var wH = wDataAll[0];
           for (var k = 1; k < wDataAll.length; k++) {
              var rowD = wDataAll[k][wH.indexOf('Date')];
              if (rowD instanceof Date) rowD = formatDate(rowD);
              if (String(rowD) === String(datePos)) {
                 if (wDataAll[k][wH.indexOf('First Call Assignee')] === originalAssignee) {
                    wSheet.getRange(k + 1, wH.indexOf('First Call Assignee') + 1).setValue(participantId);
                 }
                 break;
              }
           }
        } else if (assignmentType === 'HOLIDAY') {
           // datePos could be "Holiday Name - Position"
           var hSheet = ss.getSheetByName('Holiday Coverage');
           var hDataAll = hSheet.getDataRange().getValues();
           var hH = hDataAll[0];
           for (var k = 1; k < hDataAll.length; k++) {
              var holNamePos = hDataAll[k][hH.indexOf('Holiday Name')] + ' - ' + hDataAll[k][hH.indexOf('Call Position (Call 1 / Call 2)')];
              if (holNamePos === String(datePos)) {
                 if (hDataAll[k][hH.indexOf('Assigned Participant')] === originalAssignee) {
                    hSheet.getRange(k + 1, hH.indexOf('Assigned Participant') + 1).setValue(participantId);
                 }
                 break;
              }
           }
        }
      }

      // Advance Queue after successful selection submission
      advanceQueue();
      return { success: true };
    }

    throw new Error("Invalid action.");
  });
}
