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
  var sanitizedName = (name || '').toString().trim().toLowerCase();
  var sanitizedPin = (pin || '').toString().trim();
  var participants = getSheetDataAsObjects('Participant Config');

  for (var i = 0; i < participants.length; i++) {
    var p = participants[i];
    if (String(p['Name']).trim().toLowerCase() === sanitizedName &&
        String(p['PIN']).trim() === sanitizedPin) {

      // Check if active for the year
      if (p['Active for Year'] !== true && p['Active for Year'] !== 'TRUE') {
        return { success: false, error: 'User is not active for the current lottery year.' };
      }

      return {
        success: true,
        participantName: p['Name']
      };
    }
  }

  return { success: false, error: 'Invalid Name or PIN.' };
}

/**
 * Fetches the current state of the application for the given participant
 * @param {string} participantId
 * @returns {object} Application state
 */
function getInitialState(participantId, pin) {
  var sanitizedId = (participantId || '').toString().trim();
  var sanitizedPin = (pin || '').toString().trim();

  var adminOptions = getAdminOptions();
  var state = getQueueState();
  var activeYear = adminOptions['Active Year'] || new Date().getFullYear().toString();

  var participants = getSheetDataAsObjects('Participant Config');
  var participant = null;
  for (var i = 0; i < participants.length; i++) {
    if (participants[i]['Name'] === sanitizedId && String(participants[i]['PIN']).trim() === sanitizedPin) {
      participant = participants[i];
      break;
    }
  }

  if (!participant) {
    return { success: false, error: 'Participant session invalid. Please log in again.' };
  }

  // Check active status
  var activeWindow = getActiveParticipants(state.phase);
  var isActive = false;
  for (var i = 0; i < activeWindow.length; i++) {
    if (activeWindow[i]['Name'] === sanitizedId) {
      isActive = true;
      break;
    }
  }

  var response = {
    success: true,
    activeYear: activeYear || new Date().getFullYear().toString(),
    phase: state ? state.phase : 'INACTIVE',
    round: state ? state.round : 1,
    direction: state ? state.direction : 'ASCENDING',
    participant: participant || {},
    isActive: isActive,
    availableChoices: {
      vacation: [],
      weekend: [],
      holiday: [],
      myAssignments: [],
      transferOffers: []
    }
  };

  // Populate available choices based on phase
  if (state.phase === 'VACATION_SENIORITY' || state.phase === 'VACATION_RANDOM') {
    response.availableChoices.vacation = getSheetDataAsObjects('Vacation Availability');
    attachSoftHolidayWarnings_(response.availableChoices.vacation, 'Start Date (Monday)', 4);
  } else if (state.phase === 'WEEKEND') {
    var rawWeekends = getSheetDataAsObjects('Weekend Coverage');
    var processedWeekends = [];
    var pName = participant['Name']; // exact canonical name

    for (var i = 0; i < rawWeekends.length; i++) {
      var w = rawWeekends[i];
      var warnStr = String(w['Vacation Adjacency Warning'] || '');
      var affectedNames = warnStr.split(',').map(function(s) { return s.trim(); });

      // Exact canonical name matching
      var nearVacation = false;
      for (var k = 0; k < affectedNames.length; k++) {
        if (affectedNames[k] === pName) {
           nearVacation = true;
           break;
        }
      }

      w['nearVacation'] = nearVacation;
      delete w['Vacation Adjacency Warning']; // Prevent names from leaking to client

      processedWeekends.push(w);
    }

    attachSoftHolidayWarnings_(processedWeekends, 'Date', 0);
    response.availableChoices.weekend = processedWeekends;
    response.availableChoices.holiday = getSheetDataAsObjects('Holiday Coverage');
    attachSoftHolidayWarnings_(response.availableChoices.holiday, 'Observed Date', 0);
  } else if (state.phase === 'HOLIDAY_VOLUNTEER' || state.phase === 'HOLIDAY_MANDATORY') {
    response.availableChoices.holiday = getSheetDataAsObjects('Holiday Coverage');
    attachSoftHolidayWarnings_(response.availableChoices.holiday, 'Observed Date', 0);

    var proximityStr = adminOptions['Holiday Proximity Range (days)'];
    var proximityRange = (proximityStr !== undefined && proximityStr !== '') ? parseInt(proximityStr, 10) : 3;

    var vacs = getSheetDataAsObjects('Vacation Availability');
    var wks = getSheetDataAsObjects('Weekend Coverage');

    var myVacations = [];
    for (var i = 0; i < vacs.length; i++) {
      var assigneesStr = String(vacs[i]['Assigned Participants'] || '');
      var assignees = assigneesStr ? assigneesStr.split(',').map(function(n) { return n.trim(); }) : [];
      if (assignees.indexOf(participant['Name']) !== -1) {
        myVacations.push(vacs[i]);
      }
    }

    var myWeekends = [];
    for (var i = 0; i < wks.length; i++) {
      if (wks[i]['First Call Assignee'] === participant['Name']) {
        myWeekends.push(wks[i]);
      }
    }

    for (var i = 0; i < response.availableChoices.holiday.length; i++) {
      var h = response.availableChoices.holiday[i];
      var rawDate = h['Observed Date'];
      if (rawDate instanceof Date) rawDate = formatDate(rawDate);
      var parts = String(rawDate).split('-');
      if (parts.length !== 3) continue;

      var hLocalDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      var hUtc = Date.UTC(hLocalDate.getFullYear(), hLocalDate.getMonth(), hLocalDate.getDate());

      // Check proximity to working weekends
      var nearWorkingWeekend = false;
      var nearWorkingWeekendDate = null;
      for (var k = 0; k < myWeekends.length; k++) {
        var wDate = myWeekends[k]['Date'];
        if (wDate instanceof Date) wDate = formatDate(wDate);
        var wParts = String(wDate).split('-');
        if (wParts.length === 3) {
          var wLocalDate = new Date(parseInt(wParts[0], 10), parseInt(wParts[1], 10) - 1, parseInt(wParts[2], 10));
          var wUtc = Date.UTC(wLocalDate.getFullYear(), wLocalDate.getMonth(), wLocalDate.getDate());
          var diffDays = Math.floor(Math.abs(hUtc - wUtc) / (1000 * 60 * 60 * 24));
          if (diffDays <= proximityRange) {
            nearWorkingWeekend = true;
            nearWorkingWeekendDate = wDate;
            break;
          }
        }
      }
      h['nearWorkingWeekend'] = nearWorkingWeekend;
      if (nearWorkingWeekendDate) h['nearWorkingWeekendDate'] = nearWorkingWeekendDate;

      // Check proximity to vacations
      var nearVacation = false;
      var nearVacationWeek = null;
      for (var k = 0; k < myVacations.length; k++) {
        var vDate = myVacations[k]['Start Date (Monday)'];
        if (vDate instanceof Date) vDate = formatDate(vDate);
        var vParts = String(vDate).split('-');
        if (vParts.length === 3) {
          var vLocalDate = new Date(parseInt(vParts[0], 10), parseInt(vParts[1], 10) - 1, parseInt(vParts[2], 10));

          var satBefore = new Date(vLocalDate.getFullYear(), vLocalDate.getMonth(), vLocalDate.getDate() - 2);
          var sunAfter = new Date(vLocalDate.getFullYear(), vLocalDate.getMonth(), vLocalDate.getDate() + 6);

          var satBeforeUtc = Date.UTC(satBefore.getFullYear(), satBefore.getMonth(), satBefore.getDate());
          var sunAfterUtc = Date.UTC(sunAfter.getFullYear(), sunAfter.getMonth(), sunAfter.getDate());

          if (hUtc >= satBeforeUtc && hUtc <= sunAfterUtc) {
            nearVacation = true;
            nearVacationWeek = myVacations[k]['Week ID'];
            break;
          }
        }
      }
      h['nearVacation'] = nearVacation;
      if (nearVacationWeek) h['nearVacationWeek'] = nearVacationWeek;
    }

  } else if (state.phase === 'TRANSFER_OFFER_COLLECTION') {
    // Stage A: Givers
    var myAssignments = [];

    var vacs = getSheetDataAsObjects('Vacation Availability');
    for (var i = 0; i < vacs.length; i++) {
      if (String(vacs[i]['Assigned Participants']).indexOf(sanitizedId) !== -1) {
        myAssignments.push({ type: 'VACATION', details: vacs[i] });
      }
    }

    var wks = getSheetDataAsObjects('Weekend Coverage');
    for (var i = 0; i < wks.length; i++) {
      if (wks[i]['First Call Assignee'] === sanitizedId) {
        myAssignments.push({ type: 'WEEKEND', details: wks[i] });
      }
    }

    var hols = getSheetDataAsObjects('Holiday Coverage');
    for (var i = 0; i < hols.length; i++) {
      if (hols[i]['Assigned Participant'] === sanitizedId) {
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

  return makeClientSafe_(response);
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

    if (selectionData.phase && selectionData.phase !== phase) {
      if ((selectionData.phase === 'HOLIDAY_VOLUNTEER' || selectionData.phase === 'HOLIDAY_MANDATORY') && phase === 'TRANSFER_OFFER_COLLECTION') {
        throw new Error("Holiday selection is no longer available because holiday coverage is complete. Please refresh.");
      }
      throw new Error("The lottery phase has changed. Please refresh the page.");
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
      if (phase === 'HOLIDAY_MANDATORY') {
        throw new Error('Passing is not allowed during Mandatory Holiday selection.');
      } else if (phase === 'HOLIDAY_VOLUNTEER') {
        pSheet.getRange(pRowIdx, pHeaders.indexOf('Holiday Volunteer Response') + 1).setValue('Pass');
      } else if (phase === 'TRANSFER_RECEIVER') {
        pSheet.getRange(pRowIdx, pHeaders.indexOf('Transfer Receiver') + 1).setValue(false);
      } else if (phase === 'TRANSFER_OFFER_COLLECTION') {
        pSheet.getRange(pRowIdx, pHeaders.indexOf('Transfer Offers Submitted') + 1).setValue(true);
        // Do not advance queue for TRANSFER_OFFER_COLLECTION
        checkTransferOfferCollectionComplete_();
        return { success: true };
      }
      // advance queue
      advanceQueueInternal_();
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

        // Prevent this submission from exceeding the participant's vacation target.
        // This runs inside the existing script lock and before any spreadsheet writes.
        var defaultVacationTarget =
            getSystemTarget('Vacation Week Target Default', 9);

        var vacationTargetOverride =
            pData[pRowIdx - 1][pHeaders.indexOf('Vacation Week Target Override')];

        var effectiveVacationTarget = vacationTargetOverride !== ''
            ? parseInt(vacationTargetOverride, 10)
            : defaultVacationTarget;

        var currentVacationCount =
            getParticipantAssignments(participantId, phase, {});

        var remainingVacationWeeks =
            effectiveVacationTarget - currentVacationCount;

        if (selectedCount > remainingVacationWeeks) {
          if (remainingVacationWeeks <= 0) {
            throw new Error(
              "You have already reached your maximum vacation week allotment. No additional weeks may be selected."
            );
          }

          if (remainingVacationWeeks === 1) {
            throw new Error(
              "You may select only 1 more vacation week because you have reached your maximum week allotment. Please select one week and submit again."
            );
          }

          throw new Error(
            "You may select only " + remainingVacationWeeks +
            " more vacation weeks because that would reach your maximum week allotment. Please reduce your selection and submit again."
          );
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
          if (participantAlreadyHasWeekend_(
                participantId,
                dateStr,
                wData,
                wHeaders
              )) {
            throw new Error(
              "You already hold the other First Call position for this weekend. " +
              "You cannot select both Saturday and Sunday of the same weekend."
            );
          }
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
        var partialSuccessMessage = null;
        if (selectionData.adjacentHoliday && selectionData.adjacentHoliday.holidayName) {
           var hSheet = ss.getSheetByName('Holiday Coverage');
           var hData = hSheet.getDataRange().getValues();
           var hHeaders = hData[0];

           if (participantAlreadyHasHoliday_(
                 participantId,
                 selectionData.adjacentHoliday.holidayName,
                 hData,
                 hHeaders
               )) {
             // Do not fail the weekend selection. Just ignore the holiday and return a message.
             partialSuccessMessage = "Weekend selection successful. However, the adjacent holiday (" + selectionData.adjacentHoliday.holidayName + ") was not added because you already hold a call position for it.";
           } else {
             var hFound = false;
             for (var i = 1; i < hData.length; i++) {
               if (hData[i][hHeaders.indexOf('Holiday Name')] === selectionData.adjacentHoliday.holidayName &&
                   hData[i][hHeaders.indexOf('Call Position (Call 1 / Call 2)')] === selectionData.adjacentHoliday.position) {
                   if (hData[i][hHeaders.indexOf('Assigned Participant')]) {
                      // Do not fail the weekend selection. Just ignore the holiday and return a message.
                      partialSuccessMessage = "Weekend selection successful. However, the adjacent holiday (" + selectionData.adjacentHoliday.holidayName + " - " + selectionData.adjacentHoliday.position + ") was just selected by another participant and was not added.";
                   } else {
                      holidayUpdate = {sheet: hSheet, row: i + 1, col: hHeaders.indexOf('Assigned Participant') + 1};
                   }
                   hFound = true;
                   break;
               }
             }
             if (!hFound) throw new Error("Adjacent holiday not found.");
           }
        }

        // 2. Perform updates after all validations pass
        for (var i = 0; i < weekendUpdates.length; i++) {
           wSheet.getRange(weekendUpdates[i].row, weekendUpdates[i].col).setValue(participantId);
        }
        if (holidayUpdate) {
           holidayUpdate.sheet.getRange(holidayUpdate.row, holidayUpdate.col).setValue(participantId);

           // Send SMS confirmation for adjacent holiday reservation
           try {
             var phone = pData[pRowIdx - 1][pHeaders.indexOf('Phone Number')];
             if (phone) {
               var holName = selectionData.adjacentHoliday.holidayName;
               var pos = selectionData.adjacentHoliday.position;
               var notifResult = sendNotification_(phone, "Vacation Lottery Confirmation: You have successfully reserved " + holName + " (" + pos + ").");
               if (notifResult && !notifResult.success) {
                 console.warn("[WARN] Failed to send adjacent-holiday confirmation to " + phone + ". Selection remains committed.");
               }
             }
           } catch (err) {
             console.error("Failed to send adjacent holiday confirmation SMS: " + err.message);
           }
        }

      } else if (phase === 'HOLIDAY_VOLUNTEER' || phase === 'HOLIDAY_MANDATORY') {
        if (!hasOpenHolidayPositions_()) {
          throw new Error(
            "Holiday coverage is already complete. No additional holiday selections are available."
          );
        }

        // selections contains the row index or matching criteria
        var hSheet = ss.getSheetByName('Holiday Coverage');
        var hData = hSheet.getDataRange().getValues();
        var hHeaders = hData[0];

        var selectedItem = selectionData.selections[0]; // e.g. { name: 'Memorial Day', position: 'CALL_2' }
        var found = false;

        if (participantAlreadyHasHoliday_(
              participantId,
              selectedItem.name,
              hData,
              hHeaders
            )) {
          throw new Error(
            "You already hold a call position for this holiday. " +
            "You cannot hold both Call 1 and Call 2 for the same holiday."
          );
        }

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
        // Stage A Givers: Provide items to the pool
        var tSheet = ss.getSheetByName('Transfer Offers');
        for (var i = 0; i < selectionData.selections.length; i++) {
          var item = selectionData.selections[i];
          if (!item || !item.type) throw new Error("Invalid transfer offer data provided.");
          var offerId = 'OFFER-' + new Date().getTime() + '-' + Math.floor(Math.random()*1000) + '-' + i;
          var tData = [offerId, participantId, item.type, item.datePos, 'Active', new Date()];
          tSheet.appendRow(tData);
        }
        pSheet.getRange(pRowIdx, pHeaders.indexOf('Transfer Offers Submitted') + 1).setValue(true);
        // Do not advance queue directly, check completion
        checkTransferOfferCollectionComplete_();
        return { success: true };
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
      advanceQueueInternal_();
      if (partialSuccessMessage) {
        return { success: true, message: partialSuccessMessage };
      }
      return { success: true };
    }

    throw new Error("Invalid action.");
  });
}

/**
 * Retrieves the universal Rules & Tips message for the public UI.
 * Does not require authentication.
 */
function getRulesAndTips() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Rules & Tips');

  var fallbackText = 'Rules & Tips have not been configured yet.';

  if (!sheet) {
    return fallbackText;
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return fallbackText;
  }

  var headers = data[0];
  var textIdx = headers.indexOf('Display Text');

  if (textIdx === -1) {
    return fallbackText;
  }

  var combinedRules = [];

  for (var i = 1; i < data.length; i++) {
    var displayText = (data[i][textIdx] || '').toString().trim();
    if (displayText) {
      combinedRules.push(displayText);
    }
  }

  if (combinedRules.length === 0) {
    return fallbackText;
  }

  return combinedRules.join('\n\n');
}


/**
 * Checks if all givers have submitted their offers during TRANSFER_OFFER_COLLECTION.
 * If so, updates Phase Ready.
 */
function checkTransferOfferCollectionComplete_() {
  var state = getQueueState();
  if (state.phase !== 'TRANSFER_OFFER_COLLECTION') return;

  var activeWindow = getActiveParticipants('TRANSFER_OFFER_COLLECTION');
  if (activeWindow.length === 0) {
    setSystemConfig({
      'Phase Ready': 'TRANSFER_RECEIVER'
    });
  }
}
