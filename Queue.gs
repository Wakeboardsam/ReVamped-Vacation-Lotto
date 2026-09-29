/**
 * Queue.gs - Core queue engine, serpentine logic, and queue advancement helper
 */

/**
 * Helper to fetch all rows dynamically mapped to an object by headers.
 */
function getSheetDataAsObjects(sheetName, cache) {
  if (cache && cache[sheetName]) return cache[sheetName];
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var objects = [];
  for (var i = 1; i < data.length; i++) {
    var obj = { _rowIndex: i + 1 }; // 1-based index in sheets
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    objects.push(obj);
  }
  if (cache) cache[sheetName] = objects;
  return objects;
}

/**
 * Get dynamic assignments for a specific participant within a given phase context.
 */
function getParticipantAssignments(participantName, phase, cache) {
  var count = 0;

  if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
    var vacationData = getSheetDataAsObjects('Vacation Availability', cache);
    for (var i = 0; i < vacationData.length; i++) {
      var assignedStr = String(vacationData[i]['Assigned Participants'] || '');
      if (assignedStr.indexOf(participantName) !== -1) {
        var assignees = assignedStr.split(',').map(function(s) { return s.trim(); });
        for (var j = 0; j < assignees.length; j++) {
          if (assignees[j] === participantName) {
            count++;
          }
        }
      }
    }
  } else if (phase === 'WEEKEND') {
    var weekendData = getSheetDataAsObjects('Weekend Coverage', cache);
    for (var i = 0; i < weekendData.length; i++) {
      if (weekendData[i]['First Call Assignee'] === participantName) {
        count++;
      }
    }
  } else if (phase === 'HOLIDAY_VOLUNTEER' || phase === 'HOLIDAY_MANDATORY') {
    var holidayData = getSheetDataAsObjects('Holiday Coverage', cache);
    for (var i = 0; i < holidayData.length; i++) {
      if (holidayData[i]['Assigned Participant'] === participantName) {
        count++;
      }
    }
  } else if (phase === 'TRANSFER_RECEIVER') {
    var adminOptions = getAdminOptions();
    var activeYear = String(adminOptions['Active Year'] || new Date().getFullYear());
    var state = getQueueState();
    var currentRound = String(state.round);

    var histData = getSheetDataAsObjects('Transfer History', cache);
    var seenClaimIds = {};
    for (var i = 0; i < histData.length; i++) {
      if (String(histData[i]['New Assignee']) === participantName &&
          String(histData[i]['Year']) === activeYear &&
          String(histData[i]['Receiver Round']) === currentRound) {
        var claimId = String(histData[i]['Claim ID'] || '');
        if (claimId) {
          if (!seenClaimIds[claimId]) {
            seenClaimIds[claimId] = true;
            count++;
          }
        } else {
          // Fallback if Claim ID missing, count each row as 1 action
          count++;
        }
      }
    }
  }

  return count;
}

/**
 * Checks if a participant has at least one legal open holiday choice.
 */
function participantHasLegalHolidayChoice_(participantName, cache) {
  var hols = getSheetDataAsObjects('Holiday Coverage', cache);
  for (var i = 0; i < hols.length; i++) {
    var assignee = String(hols[i]['Assigned Participant'] || '').trim();
    if (!assignee) {
      var hName = hols[i]['Holiday Name'];
      var holdsThisHoliday = false;
      for (var j = 0; j < hols.length; j++) {
        if (hols[j]['Holiday Name'] === hName && String(hols[j]['Assigned Participant'] || '').trim() === participantName) {
          holdsThisHoliday = true;
          break;
        }
      }
      if (!holdsThisHoliday) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if a participant has at least one legal open weekend choice.
 */
function participantHasLegalWeekendChoice_(participantName, cache) {
  var wks = getSheetDataAsObjects('Weekend Coverage', cache);
  var wHeaders = Object.keys(wks[0] || {});
  var wData = [wHeaders];
  for (var k = 0; k < wks.length; k++) {
    var row = [];
    for (var c = 0; c < wHeaders.length; c++) row.push(wks[k][wHeaders[c]]);
    wData.push(row);
  }

  for (var i = 0; i < wks.length; i++) {
    var assignee = String(wks[i]['First Call Assignee'] || '').trim();
    if (!assignee) {
      var dateVal = wks[i]['Date'];
      if (!participantAlreadyHasWeekend_(participantName, dateVal, wData, wHeaders)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Gets the active window of participants based on phase, round, direction, and lead.
 */
function getQueueWindows_(phase, state, cache) {
  if (getReadinessInfo(phase) || getReadinessInfo(state && state.phase)) {
    return {
      activeWindow: [],
      upNextWindow: [],
      windowSize: 0,
      participants: getSheetDataAsObjects('Participant Config', cache)
    };
  }

  var effectivePhase = (state && state.phase) ? state.phase : phase;

  if (
    ((effectivePhase === 'HOLIDAY_VOLUNTEER' || effectivePhase === 'HOLIDAY_MANDATORY') && !hasOpenHolidayPositions_()) ||
    ((effectivePhase === 'VACATION_SENIORITY' || effectivePhase === 'VACATION_RANDOM') && !hasOpenVacationWeeks_())
  ) {
    return {
      activeWindow: [],
      upNextWindow: [],
      windowSize: getActiveWindowSize(effectivePhase),
      participants: getSheetDataAsObjects('Participant Config', cache)
    };
  }

  var currentRound = state.round;
  var direction = state.direction;
  var lead = state.lead;

  var participants = getSheetDataAsObjects('Participant Config', cache);

  if (effectivePhase === 'TRANSFER_OFFER_COLLECTION') {
    var activeWindow = [];
    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      if (p['Active for Year'] !== true && p['Active for Year'] !== 'TRUE') continue;
      var isGiver = p['Transfer Giver'] === true || p['Transfer Giver'] === 'TRUE';
      var isSubmitted = p['Transfer Offers Submitted'] === true || p['Transfer Offers Submitted'] === 'TRUE';
      if (isGiver && !isSubmitted) {
        activeWindow.push(p);
      }
    }
    return {
      activeWindow: activeWindow,
      upNextWindow: [],
      windowSize: activeWindow.length,
      participants: participants
    };
  }

  var eligiblePool = [];
  var defaultVacationCap = getSystemTarget('Vacation Week Target Default', 9);

  for (var i = 0; i < participants.length; i++) {
    var p = participants[i];
    if (p['Active for Year'] !== true && p['Active for Year'] !== 'TRUE') continue;

    var isEligibleForPhase = false;
    var targetCap = 999;

    if (effectivePhase === 'VACATION_SENIORITY' || effectivePhase === 'VACATION_RANDOM') {
      if (p['Vacation Phase Enabled'] === true || p['Vacation Phase Enabled'] === 'TRUE') {
        isEligibleForPhase = true;
        targetCap = p['Vacation Week Target Override'] !== '' ? parseInt(p['Vacation Week Target Override']) : defaultVacationCap;
      }
    } else if (effectivePhase === 'WEEKEND') {
      if (p['Weekend Phase Enabled'] === true || p['Weekend Phase Enabled'] === 'TRUE') {
        isEligibleForPhase = true;
        targetCap = p['Weekend Assignment Maximum'] !== '' ? parseInt(p['Weekend Assignment Maximum']) : 999;
      }
    } else if (effectivePhase === 'HOLIDAY_VOLUNTEER') {
      var volResp = String(p['Holiday Volunteer Response'] || '').toLowerCase();
      var volFlag = (p['Holiday Volunteer'] === true || p['Holiday Volunteer'] === 'TRUE');
      if ((volResp === 'yes' || volFlag) && volResp !== 'pass') isEligibleForPhase = true;
    } else if (effectivePhase === 'HOLIDAY_MANDATORY') {
      if (p['Mandatory Holiday Eligible'] === true || p['Mandatory Holiday Eligible'] === 'TRUE') isEligibleForPhase = true;
    } else if (effectivePhase === 'TRANSFER_OFFER_COLLECTION') {
      if (p['Transfer Giver'] === true || p['Transfer Giver'] === 'TRUE') isEligibleForPhase = true;
    } else if (effectivePhase === 'TRANSFER_RECEIVER') {
      if ((p['Transfer Receiver'] === true || p['Transfer Receiver'] === 'TRUE') && p['Transfer Receiver'] !== false && p['Transfer Receiver'] !== 'FALSE') isEligibleForPhase = true;
    }

    if (!isEligibleForPhase) continue;

    var actualAssignments = getParticipantAssignments(p['Name'], effectivePhase, cache);

    var isEligibleForRound = false;
    if (effectivePhase === 'TRANSFER_RECEIVER') {
      isEligibleForRound = actualAssignments < 1;
    } else {
      isEligibleForRound = (actualAssignments < targetCap) && (actualAssignments < currentRound);

      if (isEligibleForRound) {
        if (effectivePhase === 'HOLIDAY_VOLUNTEER' || effectivePhase === 'HOLIDAY_MANDATORY') {
          if (!participantHasLegalHolidayChoice_(p['Name'], cache)) {
            isEligibleForRound = false;
          }
        } else if (effectivePhase === 'WEEKEND') {
          if (!participantHasLegalWeekendChoice_(p['Name'], cache)) {
            isEligibleForRound = false;
          }
        } else if (effectivePhase === 'VACATION_SENIORITY' || effectivePhase === 'VACATION_RANDOM') {
          if (!hasOpenVacationWeeks_()) {
            isEligibleForRound = false;
          }
        }
      }
    }

    eligiblePool.push({
      participant: p,
      isEligible: isEligibleForRound,
      sortPosition: effectivePhase === 'VACATION_SENIORITY' ? parseInt(p['Seniority Position']) : parseInt(p['Lottery Position'])
    });
  }

  eligiblePool.sort(function(a, b) {
    return a.sortPosition - b.sortPosition;
  });

  var windowSize = getActiveWindowSize(effectivePhase);
  var activeWindow = [];
  var upNextWindow = [];

  var startIndex = -1;
  for (var i = 0; i < eligiblePool.length; i++) {
    if (eligiblePool[i].sortPosition === lead) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    return { activeWindow: [], upNextWindow: [], windowSize: windowSize, participants: participants };
  }

  var currentIndex = startIndex;
  var step = direction === 'ASCENDING' ? 1 : -1;
  var iterations = 0;

  while (iterations < windowSize && currentIndex >= 0 && currentIndex < eligiblePool.length) {
    if (eligiblePool[currentIndex].isEligible) {
      activeWindow.push(eligiblePool[currentIndex].participant);
    }
    currentIndex += step;
    iterations++;
  }

  var upNextCount = 0;
  while (upNextCount < 10 && currentIndex >= 0 && currentIndex < eligiblePool.length) {
    if (eligiblePool[currentIndex].isEligible) {
      upNextWindow.push(eligiblePool[currentIndex].participant);
      upNextCount++;
    }
    currentIndex += step;
  }

  return { activeWindow: activeWindow, upNextWindow: upNextWindow, windowSize: windowSize, participants: participants };
}

function getActiveParticipants(phase) {
  var state = getQueueState();
  return getQueueWindows_(phase, state, {}).activeWindow;
}

function advanceQueue() {
  return withScriptLock(function() {
    return advanceQueueInternal_();
  });
}

function advanceQueueInternal_() {
    var state = getQueueState();
    var phase = state.phase;

    if (getReadinessInfo(phase)) {
      return { success: true, ready: true, message: 'Queue is waiting for an administrator.' };
    }

    if (phase === 'TRANSFER_OFFER_COLLECTION') {
      return { success: true, message: 'Transfer offer collection does not advance like a queue.' };
    }

    if (phase === 'TRANSFER_RECEIVER') {
      var offers = getSheetDataAsObjects('Transfer Offers', {});
      var activeOffers = 0;
      for (var i = 0; i < offers.length; i++) {
        if (offers[i]['Status'] !== 'Claimed' && offers[i]['Assignment Type'] !== 'VACATION') {
          activeOffers++;
        }
      }
      if (activeOffers === 0) {
        setQueueState({ phase: 'COMPLETE' });
        return { success: true, complete: true, message: 'No active transferable offers remain.' };
      }
    }

    if (
      phase === 'HOLIDAY_VOLUNTEER' ||
      phase === 'HOLIDAY_MANDATORY'
    ) {
      var hStatus = getHolidayPhaseStatus();
      if (hStatus.status === 'SETUP_ERROR') {
        return { success: false, setupError: true, error: hStatus.reason || 'Holiday setup error.' };
      }
      if (hStatus.status === 'COMPLETE') {
        var nextInfo = getNextReadyStateFromHoliday();
        if (nextInfo.setupError) {
          return { success: false, setupError: true, error: nextInfo.setupError };
        }
        if (nextInfo.readyPhase) {
          setQueueState({
            phase: nextInfo.readyPhase,
            round: 1,
            direction: 'ASCENDING',
            lead: 1
          });
          return {
            success: true,
            complete: true,
            message: 'All holiday call positions are filled. Staged ' + nextInfo.readyPhase + '.'
          };
        }
      } else if (phase === 'HOLIDAY_VOLUNTEER' && !hasLegalHolidayChoices_()) {
        setQueueState({
          phase: 'READY_HOLIDAY_MANDATORY',
          round: 1,
          direction: 'ASCENDING',
          lead: 1
        });
        return {
          success: true,
          ready: true,
          message: 'Holiday volunteer participation is exhausted. Staged READY_HOLIDAY_MANDATORY.'
        };
      }
    }

    if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
      var vStatus = getVacationPhaseStatus();
      if (vStatus.status === 'SETUP_ERROR') {
        return { success: false, setupError: true, error: vStatus.reason || 'Vacation setup error.' };
      }
      if (vStatus.status === 'COMPLETE') {
        var nextInfo = getNextReadyStateFromVacation();
        if (nextInfo.setupError) {
          return { success: false, setupError: true, error: nextInfo.setupError };
        }
        if (nextInfo.readyPhase) {
          setQueueState({
            phase: nextInfo.readyPhase,
            round: 1,
            direction: 'ASCENDING',
            lead: 1
          });
          return {
            success: true,
            complete: true,
            message: 'All vacation targets are met. Staged ' + nextInfo.readyPhase + '.'
          };
        }
      }
    }

    if (phase === 'WEEKEND') {
      var wStatus = getWeekendPhaseStatus();
      if (wStatus.status === 'SETUP_ERROR') {
        return { success: false, setupError: true, error: wStatus.reason || 'Weekend setup error.' };
      }
      if (wStatus.status === 'COMPLETE') {
        setQueueState({
          phase: 'READY_TRANSFER',
          round: 1,
          direction: 'ASCENDING',
          lead: 1
        });
        return {
          success: true,
          complete: true,
          message: 'All weekend positions are filled. Staged READY_TRANSFER.'
        };
      }
    }

    var currentRound = state.round;
    var direction = state.direction;
    var lead = state.lead;

    var participants = getSheetDataAsObjects('Participant Config');

    // Default target caps
    var defaultVacationCap = getSystemTarget('Vacation Week Target Default', 9);

    var eligiblePool = [];

    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      if (p['Active for Year'] !== true && p['Active for Year'] !== 'TRUE') continue;

      var isEligibleForPhase = false;
      var targetCap = 999;

      if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
        if (p['Vacation Phase Enabled'] === true || p['Vacation Phase Enabled'] === 'TRUE') {
          isEligibleForPhase = true;
          targetCap = p['Vacation Week Target Override'] !== '' ? parseInt(p['Vacation Week Target Override']) : defaultVacationCap;
        }
      } else if (phase === 'WEEKEND') {
        if (p['Weekend Phase Enabled'] === true || p['Weekend Phase Enabled'] === 'TRUE') {
          isEligibleForPhase = true;
          targetCap = p['Weekend Assignment Maximum'] !== '' ? parseInt(p['Weekend Assignment Maximum']) : 999;
        }
      } else if (phase === 'HOLIDAY_VOLUNTEER') {
        var volResp = String(p['Holiday Volunteer Response'] || '').toLowerCase();
        var volFlag = (p['Holiday Volunteer'] === true || p['Holiday Volunteer'] === 'TRUE');
        if ((volResp === 'yes' || volFlag) && volResp !== 'pass') {
          isEligibleForPhase = true;
        }
      } else if (phase === 'HOLIDAY_MANDATORY') {
        if (p['Mandatory Holiday Eligible'] === true || p['Mandatory Holiday Eligible'] === 'TRUE') {
          isEligibleForPhase = true;
        }
      } else if (phase === 'TRANSFER_OFFER_COLLECTION') {
        if (p['Transfer Giver'] === true || p['Transfer Giver'] === 'TRUE') {
          isEligibleForPhase = true;
        }
      } else if (phase === 'TRANSFER_RECEIVER') {
        if ((p['Transfer Receiver'] === true || p['Transfer Receiver'] === 'TRUE') && p['Transfer Receiver'] !== false && p['Transfer Receiver'] !== 'FALSE') {
          isEligibleForPhase = true;
        }
      }

      if (!isEligibleForPhase) continue;

      var actualAssignments = getParticipantAssignments(p['Name'], phase, {});

      var isEligibleForRound = false;
      if (phase === 'TRANSFER_RECEIVER') {
        isEligibleForRound = actualAssignments < 1;
      } else {
        isEligibleForRound = (actualAssignments < targetCap) && (actualAssignments < currentRound);

        if (isEligibleForRound) {
          if (phase === 'HOLIDAY_VOLUNTEER' || phase === 'HOLIDAY_MANDATORY') {
            if (!participantHasLegalHolidayChoice_(p['Name'], {})) {
              isEligibleForRound = false;
            }
          } else if (phase === 'WEEKEND') {
            if (!participantHasLegalWeekendChoice_(p['Name'], {})) {
              isEligibleForRound = false;
            }
          } else if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
            if (!hasOpenVacationWeeks_()) {
              isEligibleForRound = false;
            }
          }
        }
      }

      eligiblePool.push({
        participant: p,
        isEligible: isEligibleForRound,
        actualAssignments: actualAssignments,
        targetCap: targetCap,
        sortPosition: phase === 'VACATION_SENIORITY' ? parseInt(p['Seniority Position']) : parseInt(p['Lottery Position'])
      });
    }

    eligiblePool.sort(function(a, b) {
      return a.sortPosition - b.sortPosition;
    });

    if (eligiblePool.length === 0) {
      if (phase === 'HOLIDAY_VOLUNTEER') {
        var hStatus = getHolidayPhaseStatus();
        if (hStatus.status === 'SETUP_ERROR') {
          return { success: false, setupError: true, error: hStatus.reason || 'Holiday setup error.' };
        }
        if (hStatus.status === 'INCOMPLETE') {
          if (!hasLegalHolidayChoices_()) {
            setQueueState({
              phase: 'READY_HOLIDAY_MANDATORY',
              round: 1,
              direction: 'ASCENDING',
              lead: 1
            });
            return {
              success: true,
              ready: true,
              message: 'Holiday volunteer participation is exhausted. Staged READY_HOLIDAY_MANDATORY.'
            };
          }
        } else if (hStatus.status === 'COMPLETE') {
          var nextInfo = getNextReadyStateFromHoliday();
          if (nextInfo.setupError) {
            return { success: false, setupError: true, error: nextInfo.setupError };
          }
          if (nextInfo.readyPhase) {
            setQueueState({
              phase: nextInfo.readyPhase,
              round: 1,
              direction: 'ASCENDING',
              lead: 1
            });
            return {
              success: true,
              complete: true,
              message: 'All holiday call positions are filled. Staged ' + nextInfo.readyPhase + '.'
            };
          }
        }
      } else if (phase === 'HOLIDAY_MANDATORY') {
        var hStatus = getHolidayPhaseStatus();
        if (hStatus.status === 'SETUP_ERROR') {
          return { success: false, setupError: true, error: hStatus.reason || 'Holiday setup error.' };
        }
        if (hStatus.status === 'INCOMPLETE') {
          return { success: false, blocked: true, error: 'No eligible participants remain for Mandatory Holiday, but holiday positions are still unfilled.' };
        } else if (hStatus.status === 'COMPLETE') {
          var nextInfo = getNextReadyStateFromHoliday();
          if (nextInfo.setupError) {
            return { success: false, setupError: true, error: nextInfo.setupError };
          }
          if (nextInfo.readyPhase) {
            setQueueState({
              phase: nextInfo.readyPhase,
              round: 1,
              direction: 'ASCENDING',
              lead: 1
            });
            return {
              success: true,
              complete: true,
              message: 'All holiday call positions are filled. Staged ' + nextInfo.readyPhase + '.'
            };
          }
        }
      } else if (phase === 'WEEKEND') {
        var wStatus = getWeekendPhaseStatus();
        if (wStatus.status === 'SETUP_ERROR') {
          return { success: false, setupError: true, error: wStatus.reason || 'Weekend setup error.' };
        }
        if (wStatus.status === 'INCOMPLETE') {
          return { success: false, blocked: true, error: 'Weekend coverage is incomplete, but no eligible participants remain.' };
        }
      } else if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
        var vStatus = getVacationPhaseStatus();
        if (vStatus.status === 'SETUP_ERROR') {
          return { success: false, setupError: true, error: vStatus.reason || 'Vacation setup error.' };
        }
        if (vStatus.status === 'INCOMPLETE') {
          return { success: false, blocked: true, error: 'Vacation targets remain, but no eligible participants remain.' };
        }
      } else if (phase === 'TRANSFER_RECEIVER') {
        setQueueState({ phase: 'COMPLETE' });
        return { success: true, complete: true, message: 'Transfer Receiver phase complete.' };
      }
      return; // Queue does not advance
    }

    // Determine bounds and find next eligible lead in the current direction
    var currentIndex = -1;
    for (var i = 0; i < eligiblePool.length; i++) {
      if (eligiblePool[i].sortPosition === lead) {
        currentIndex = i;
        break;
      }
    }

    var step = direction === 'ASCENDING' ? 1 : -1;
    var nextEligibleIndex = -1;

    var leadFound = (currentIndex !== -1);

    if (!leadFound) {
      if (direction === 'ASCENDING') {
        currentIndex = -1;
        for (var i = 0; i < eligiblePool.length; i++) {
          if (eligiblePool[i].sortPosition > lead) {
            currentIndex = i - 1;
            break;
          }
        }
        if (currentIndex === -1 && eligiblePool.length > 0 && eligiblePool[eligiblePool.length - 1].sortPosition < lead) {
           currentIndex = eligiblePool.length - 1;
        }
      } else {
        currentIndex = eligiblePool.length;
        for (var i = eligiblePool.length - 1; i >= 0; i--) {
          if (eligiblePool[i].sortPosition < lead) {
            currentIndex = i + 1;
            break;
          }
        }
        if (currentIndex === eligiblePool.length && eligiblePool.length > 0 && eligiblePool[0].sortPosition > lead) {
           currentIndex = 0;
        }
      }
    }

    // Starting from CURRENT index (if found), check if the CURRENT lead is still eligible.
    if (leadFound && eligiblePool[currentIndex].isEligible) {
      return; // Queue does not advance until lead completes turn
    }

    // Lead completed turn (or was ineligible), find the next eligible person in the current direction
    for (var i = currentIndex + step; i >= 0 && i < eligiblePool.length; i += step) {
      if (eligiblePool[i].isEligible) {
        nextEligibleIndex = i;
        break;
      }
    }

    if (nextEligibleIndex !== -1) {
      // Clear tracking flags ONLY when advancing to a new lead
      if (leadFound) {
        var leadParticipant = eligiblePool[currentIndex].participant;
        var pSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Participant Config');
        var pData = pSheet.getDataRange().getValues();
        var pHeaders = pData[0];

        var entryCol = pHeaders.indexOf('Entry Timestamp') + 1;
        var remCol = pHeaders.indexOf('Reminder Sent') + 1;
        var alertCol = pHeaders.indexOf('Admin Alert Sent') + 1;

        if (entryCol > 0) {
          if (typeof logStateReset !== 'undefined') {
             logStateReset(leadParticipant, phase);
          }
          pSheet.getRange(leadParticipant._rowIndex, entryCol).clearContent();
          pSheet.getRange(leadParticipant._rowIndex, remCol).setValue(false);
          pSheet.getRange(leadParticipant._rowIndex, alertCol).setValue(false);
        }
      }

      setQueueState({
        lead: eligiblePool[nextEligibleIndex].sortPosition
      });
      return { success: true };
    } else {
      // Reached the end of the directional list (Reversal Boundary)
      var newDirection = direction === 'ASCENDING' ? 'DESCENDING' : 'ASCENDING';
      var newRound = currentRound + 1;

      if (phase === 'VACATION_SENIORITY' && newRound === 2) {
        var vStatus = getVacationPhaseStatus();
        if (vStatus.status === 'COMPLETE') {
          var nextInfo = getNextReadyStateFromVacation();
          if (!nextInfo.setupError && nextInfo.readyPhase) {
            setQueueState({
              phase: nextInfo.readyPhase,
              round: 1,
              direction: 'ASCENDING',
              lead: 1
            });
            return;
          }
        }

        setQueueState({
          phase: 'VACATION_RANDOM',
          round: 2,
          direction: 'ASCENDING',
          lead: 1
        });
        return;
      }

      // Find the first eligible person in the NEW direction for the NEW round
      var newStep = newDirection === 'ASCENDING' ? 1 : -1;
      var startIdx = newDirection === 'ASCENDING' ? 0 : eligiblePool.length - 1;
      var newLeadIdx = -1;

      // Re-evaluate eligibility for the new round
      for (var i = startIdx; i >= 0 && i < eligiblePool.length; i += newStep) {
        var p = eligiblePool[i].participant;
        if (phase === 'TRANSFER_RECEIVER') {
           newLeadIdx = i;
           break;
        } else {
           var actual = getParticipantAssignments(p['Name'], phase, {});
           var targetCap = eligiblePool[i].targetCap;
           if (actual < targetCap && actual < newRound) {
             if (phase === 'HOLIDAY_VOLUNTEER' || phase === 'HOLIDAY_MANDATORY') {
               if (participantHasLegalHolidayChoice_(p['Name'], {})) {
                 newLeadIdx = i;
                 break;
               }
             } else if (phase === 'WEEKEND') {
               if (participantHasLegalWeekendChoice_(p['Name'], {})) {
                 newLeadIdx = i;
                 break;
               }
             } else if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
               if (hasOpenVacationWeeks_()) {
                 newLeadIdx = i;
                 break;
               }
             } else {
               newLeadIdx = i;
               break;
             }
           }
        }
      }

      if (newLeadIdx !== -1) {
        if (leadFound) {
          var leadParticipant = eligiblePool[currentIndex].participant;
          var pSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Participant Config');
          var pData = pSheet.getDataRange().getValues();
          var pHeaders = pData[0];

          var entryCol = pHeaders.indexOf('Entry Timestamp') + 1;
          var remCol = pHeaders.indexOf('Reminder Sent') + 1;
          var alertCol = pHeaders.indexOf('Admin Alert Sent') + 1;

          if (entryCol > 0) {
            if (typeof logStateReset !== 'undefined') {
               logStateReset(leadParticipant, phase);
            }
            pSheet.getRange(leadParticipant._rowIndex, entryCol).clearContent();
            pSheet.getRange(leadParticipant._rowIndex, remCol).setValue(false);
            pSheet.getRange(leadParticipant._rowIndex, alertCol).setValue(false);
          }
        }

        setQueueState({
          direction: newDirection,
          round: newRound,
          lead: eligiblePool[newLeadIdx].sortPosition
        });
        return { success: true };
      } else {
        // Round boundary reached with no participant eligible for newRound
        if (phase === 'HOLIDAY_VOLUNTEER') {
          var hStatus = getHolidayPhaseStatus();
          if (hStatus.status === 'SETUP_ERROR') {
            return { success: false, setupError: true, error: hStatus.reason || 'Holiday setup error.' };
          }
          if (hStatus.status === 'COMPLETE') {
            var nextInfo = getNextReadyStateFromHoliday();
            if (nextInfo.setupError) {
              return { success: false, setupError: true, error: nextInfo.setupError };
            }
            if (nextInfo.readyPhase) {
              setQueueState({
                phase: nextInfo.readyPhase,
                round: 1,
                direction: 'ASCENDING',
                lead: 1
              });
              return {
                success: true,
                complete: true,
                message: 'All holiday call positions are filled. Staged ' + nextInfo.readyPhase + '.'
              };
            }
          } else if (hStatus.status === 'INCOMPLETE') {
            if (hasLegalHolidayChoices_()) {
              // 1. Calculate the minimum required round where at least one volunteer is eligible
              var minReqRound = Infinity;
              for (var k = 0; k < eligiblePool.length; k++) {
                var pName = eligiblePool[k].participant['Name'];
                if (participantHasLegalHolidayChoice_(pName, {})) {
                  var pAssigns = eligiblePool[k].actualAssignments;
                  var reqR = pAssigns + 1;
                  if (reqR >= newRound && reqR < minReqRound) {
                    minReqRound = reqR;
                  }
                }
              }

              if (minReqRound === Infinity) {
                // No volunteers can make a legal choice
                setQueueState({
                  phase: 'READY_HOLIDAY_MANDATORY',
                  round: 1,
                  direction: 'ASCENDING',
                  lead: 1
                });
                return {
                  success: true,
                  ready: true,
                  message: 'Holiday volunteer participation is exhausted. Staged READY_HOLIDAY_MANDATORY.'
                };
              }

              // 2. Parity flip: calculate direction across intermediate round boundaries
              var roundFlips = minReqRound - currentRound;
              var targetDirection = direction;
              if (roundFlips % 2 !== 0) {
                targetDirection = (direction === 'ASCENDING') ? 'DESCENDING' : 'ASCENDING';
              }

              // 3. Find the first volunteer in targetDirection eligible for minReqRound
              var searchStep = (targetDirection === 'ASCENDING') ? 1 : -1;
              var searchStartIdx = (targetDirection === 'ASCENDING') ? 0 : eligiblePool.length - 1;
              var targetLeadPos = -1;

              for (var i = searchStartIdx; i >= 0 && i < eligiblePool.length; i += searchStep) {
                var pCandidate = eligiblePool[i].participant;
                var candAssigns = eligiblePool[i].actualAssignments;
                if (candAssigns < minReqRound && participantHasLegalHolidayChoice_(pCandidate['Name'], {})) {
                  targetLeadPos = eligiblePool[i].sortPosition;
                  break;
                }
              }

              if (targetLeadPos !== -1) {
                setQueueState({
                  direction: targetDirection,
                  round: minReqRound,
                  lead: targetLeadPos
                });
                return { success: true, message: 'Continuing serpentine rounds for eligible volunteers.' };
              } else {
                setQueueState({
                  phase: 'READY_HOLIDAY_MANDATORY',
                  round: 1,
                  direction: 'ASCENDING',
                  lead: 1
                });
                return {
                  success: true,
                  ready: true,
                  message: 'Holiday volunteer participation is exhausted. Staged READY_HOLIDAY_MANDATORY.'
                };
              }
            } else {
              setQueueState({
                phase: 'READY_HOLIDAY_MANDATORY',
                round: 1,
                direction: 'ASCENDING',
                lead: 1
              });
              return {
                success: true,
                ready: true,
                message: 'Holiday volunteer participation is exhausted. Staged READY_HOLIDAY_MANDATORY.'
              };
            }
          }
        } else if (phase === 'HOLIDAY_MANDATORY') {
          var hStatus = getHolidayPhaseStatus();
          if (hStatus.status === 'SETUP_ERROR') {
            return { success: false, setupError: true, error: hStatus.reason || 'Holiday setup error.' };
          }
          if (hStatus.status === 'INCOMPLETE') {
            return { success: false, blocked: true, error: 'No eligible participants remain for Mandatory Holiday, but holiday positions are still unfilled.' };
          } else if (hStatus.status === 'COMPLETE') {
            var nextInfo = getNextReadyStateFromHoliday();
            if (nextInfo.setupError) {
              return { success: false, setupError: true, error: nextInfo.setupError };
            }
            if (nextInfo.readyPhase) {
              setQueueState({
                phase: nextInfo.readyPhase,
                round: 1,
                direction: 'ASCENDING',
                lead: 1
              });
              return {
                success: true,
                complete: true,
                message: 'All holiday call positions are filled. Staged ' + nextInfo.readyPhase + '.'
              };
            }
          }
        } else if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
          var vStatus = getVacationPhaseStatus();
          if (vStatus.status === 'SETUP_ERROR') {
            return { success: false, setupError: true, error: vStatus.reason || 'Vacation setup error.' };
          }
          if (vStatus.status === 'COMPLETE') {
            var nextInfo = getNextReadyStateFromVacation();
            if (nextInfo.setupError) {
              return { success: false, setupError: true, error: nextInfo.setupError };
            }
            if (nextInfo.readyPhase) {
              setQueueState({
                phase: nextInfo.readyPhase,
                round: 1,
                direction: 'ASCENDING',
                lead: 1
              });
              return {
                success: true,
                complete: true,
                message: 'All vacation targets are met. Staged ' + nextInfo.readyPhase + '.'
              };
            }
          }
          return { success: false, blocked: true, error: 'Vacation targets remain, but no eligible choices/participants remain.' };
        } else if (phase === 'WEEKEND') {
          var wStatus = getWeekendPhaseStatus();
          if (wStatus.status === 'SETUP_ERROR') {
            return { success: false, setupError: true, error: wStatus.reason || 'Weekend setup error.' };
          }
          if (wStatus.status === 'COMPLETE') {
            setQueueState({
              phase: 'READY_TRANSFER',
              round: 1,
              direction: 'ASCENDING',
              lead: 1
            });
            return {
              success: true,
              complete: true,
              message: 'All weekend positions are filled. Staged READY_TRANSFER.'
            };
          }
          return { success: false, blocked: true, error: 'Weekend coverage is incomplete, but no eligible participants remain.' };
        }

        if (phase === 'TRANSFER_RECEIVER') {
          setQueueState({
            phase: 'COMPLETE'
          });
        }
      }
    }
}
