/**
 * Queue.gs - Core queue engine, serpentine logic, and queue advancement helper
 */

/**
 * Helper to fetch all rows dynamically mapped to an object by headers.
 */
function getSheetDataAsObjects(sheetName) {
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
  return objects;
}

/**
 * Get dynamic assignments for a specific participant within a given phase context.
 */
function getParticipantAssignments(participantName, phase) {
  var count = 0;

  if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
    var vacationData = getSheetDataAsObjects('Vacation Availability');
    for (var i = 0; i < vacationData.length; i++) {
      var assignedStr = String(vacationData[i]['Assigned Participants'] || '');
      if (assignedStr.indexOf(participantName) !== -1) {
        // A simple count of appearances. Since multiple participants could be assigned,
        // we might split by comma and count.
        var assignees = assignedStr.split(',').map(function(s) { return s.trim(); });
        for (var j = 0; j < assignees.length; j++) {
          if (assignees[j] === participantName) {
            count++;
          }
        }
      }
    }
  } else if (phase === 'WEEKEND') {
    var weekendData = getSheetDataAsObjects('Weekend Coverage');
    for (var i = 0; i < weekendData.length; i++) {
      if (weekendData[i]['First Call Assignee'] === participantName) {
        count++;
      }
    }
  }
  // Similar logic for holidays etc. could go here, but focusing on standard phases

  return count;
}

/**
 * Gets the active window of participants based on phase, round, direction, and lead.
 */
function getActiveParticipants(phase) {
  var state = getQueueState();
  var currentRound = state.round;
  var direction = state.direction; // 'ASCENDING' or 'DESCENDING'
  var lead = state.lead; // 1-based index (e.g. 1 means position 1)

  var participants = getSheetDataAsObjects('Participant Config');

  // 1. Filter and identify eligible participants
  var eligiblePool = [];

  // Default target caps
  var defaultVacationCap = getSystemTarget('Vacation Week Target Default', 9);

  for (var i = 0; i < participants.length; i++) {
    var p = participants[i];

    // Check if Active for Year
    if (p['Active for Year'] !== true && p['Active for Year'] !== 'TRUE') {
      continue;
    }

    // Phase-specific eligibility
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
    }
    // Expand for holidays etc...

    if (!isEligibleForPhase) continue;

    // Calculate current actual assignments
    var actualAssignments = getParticipantAssignments(p['Name'], phase);

    // Calculate effective assignments for Round comparison
    var skippedTurns = parseInt(p['Skipped Turns Remaining']) || 0;
    var effectiveAssignments = actualAssignments + skippedTurns;

    // Round Eligibility Check. They are ineligible if they reached the target cap OR met the round quota.
    var isEligibleForRound = (actualAssignments < targetCap) && (effectiveAssignments < currentRound);

    eligiblePool.push({
      participant: p,
      isEligible: isEligibleForRound,
      sortPosition: phase === 'VACATION_SENIORITY' ? parseInt(p['Seniority Position']) : parseInt(p['Lottery Position'])
    });
  }

  // 2. Sort the pool
  eligiblePool.sort(function(a, b) {
    return a.sortPosition - b.sortPosition;
  });

  // 3. Determine active window
  // The lead dictates the start of the window.
  var windowSize = getActiveWindowSize(phase);
  var activeWindow = [];

  // Find the lead index in the sorted pool
  var startIndex = -1;
  for (var i = 0; i < eligiblePool.length; i++) {
    if (eligiblePool[i].sortPosition === lead) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    return []; // Lead not found in pool
  }

  // Build window starting from lead in the specified direction
  // Loop exactly windowSize times to strictly enforce Head-of-Queue Priority rule.
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

  return activeWindow;
}

/**
 * Validates if the queue can advance and advances the 'Lead' correctly.
 *
 * Re-calculates eligibility and finds the next valid lead.
 * If all eligible participants in the current direction have completed their turns,
 * it waits for any remaining participants in the directional window to finish.
 * Once all are finished, it reverses the direction and optionally increments the round.
 */
function advanceQueue() {
  return withScriptLock(function() {
    var state = getQueueState();
    var phase = state.phase;
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
      }

      if (!isEligibleForPhase) continue;

      var actualAssignments = getParticipantAssignments(p['Name'], phase);
      var skippedTurns = parseInt(p['Skipped Turns Remaining']) || 0;
      var effectiveAssignments = actualAssignments + skippedTurns;

      var isEligibleForRound = (actualAssignments < targetCap) && (effectiveAssignments < currentRound);

      eligiblePool.push({
        participant: p,
        isEligible: isEligibleForRound,
        sortPosition: phase === 'VACATION_SENIORITY' ? parseInt(p['Seniority Position']) : parseInt(p['Lottery Position'])
      });
    }

    eligiblePool.sort(function(a, b) {
      return a.sortPosition - b.sortPosition;
    });

    // Determine bounds and find next eligible lead in the current direction
    var currentIndex = -1;
    for (var i = 0; i < eligiblePool.length; i++) {
      if (eligiblePool[i].sortPosition === lead) {
        currentIndex = i;
        break;
      }
    }

    if (currentIndex === -1) {
      // Something went wrong, reset lead to start
      currentIndex = direction === 'ASCENDING' ? 0 : eligiblePool.length - 1;
    }

    var step = direction === 'ASCENDING' ? 1 : -1;
    var nextEligibleIndex = -1;

    // Starting from CURRENT index, check if the CURRENT lead is still eligible.
    // The head-of-queue priority rule: if lead is still eligible, queue doesn't advance.
    if (eligiblePool[currentIndex].isEligible) {
      return; // Queue does not advance until lead completes turn
    }

    // Handle skipped turns decrement logic for the Lead if they were skipped due to a manual forfeit.
    // We only decrement if they actually skipped and their quota was fulfilled by the skip.
    var leadParticipant = eligiblePool[currentIndex].participant;
    var leadSkippedTurns = parseInt(leadParticipant['Skipped Turns Remaining']) || 0;
    if (leadSkippedTurns > 0) {
      var leadActual = getParticipantAssignments(leadParticipant['Name'], phase);
      if (leadActual + leadSkippedTurns >= currentRound) {
        // They are no longer eligible because the skipped turn pushed them over the round requirement.
        // Decrement their skipped turns and write to sheet.
        var pSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Participant Config');
        var headers = pSheet.getRange(1, 1, 1, pSheet.getLastColumn()).getValues()[0];
        var skippedColIdx = headers.indexOf('Skipped Turns Remaining') + 1;
        if (skippedColIdx > 0) {
          pSheet.getRange(leadParticipant._rowIndex, skippedColIdx).setValue(leadSkippedTurns - 1);
        }
      }
    }

    // Lead completed turn, find the next eligible person in the current direction
    for (var i = currentIndex + step; i >= 0 && i < eligiblePool.length; i += step) {
      if (eligiblePool[i].isEligible) {
        nextEligibleIndex = i;
        break;
      }
    }

    if (nextEligibleIndex !== -1) {
      // Simple advancement in current direction
      setQueueState({
        lead: eligiblePool[nextEligibleIndex].sortPosition
      });
    } else {
      // Reached the end of the directional list (Reversal Boundary)
      // Since the Lead was the last eligible person and they just finished their turn,
      // and there are no more eligible people forward in the current direction,
      // the directional window is officially closed. Everyone has completed their turn.
      // We can safely reverse direction and increment the round.

      var newDirection = direction === 'ASCENDING' ? 'DESCENDING' : 'ASCENDING';
      var newRound = currentRound + 1;

      // Find the first eligible person in the NEW direction for the NEW round
      var newStep = newDirection === 'ASCENDING' ? 1 : -1;
      var startIdx = newDirection === 'ASCENDING' ? 0 : eligiblePool.length - 1;
      var newLeadIdx = -1;

      // Re-evaluate eligibility for the new round
      for (var i = startIdx; i >= 0 && i < eligiblePool.length; i += newStep) {
        var p = eligiblePool[i].participant;
        var actual = getParticipantAssignments(p['Name'], phase);
        var skipped = parseInt(p['Skipped Turns Remaining']) || 0;
        if (actual + skipped < newRound) {
           newLeadIdx = i;
           break;
        }
      }

      if (newLeadIdx !== -1) {
        setQueueState({
          direction: newDirection,
          round: newRound,
          lead: eligiblePool[newLeadIdx].sortPosition
        });
      } else {
        // If no one is eligible in the new round, the phase is complete!
        // We handle phase transitions in the main controller, but setting state to COMPLETE
        // allows the system to recognize the end of the current phase.
        setQueueState({
          phase: 'COMPLETE'
        });
      }
    }
  });
}
