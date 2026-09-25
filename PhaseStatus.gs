/**
 * Read-only status API for assessing phase completion criteria.
 * These getters evaluate remaining requirements and return a standard format:
 * {
 *   status: 'COMPLETE' | 'INCOMPLETE' | 'SETUP_ERROR',
 *   remaining: number | null,
 *   reason: string | null
 * }
 */

/**
 * Helper to validate a vacation target (global or override).
 * Blank participant override means inherit.
 * Blank global means default of 9.
 * Valid targets are finite, nonnegative whole numbers.
 * @param {string|number} value - The target to evaluate
 * @param {boolean} isGlobal - True if validating the global default
 * @returns {number|null} Valid integer, or null if malformed
 */
function validateVacationTarget_(value, isGlobal) {
  var strVal = String(value === undefined || value === null ? '' : value).trim();

  if (strVal === '') {
    if (isGlobal) return 9; // System default if global is blank/absent
    return -1; // Special indicator to inherit for participant overrides
  }

  // Strict regex for non-negative integers only
  if (!/^\d+$/.test(strVal)) {
    return null; // Malformed
  }

  var numVal = Number(strVal);
  if (!isFinite(numVal) || numVal < 0 || Math.floor(numVal) !== numVal) {
    return null;
  }

  return numVal;
}

/**
 * Calculates remaining vacation picks based on validated targets.
 */
function getVacationPhaseStatus() {
  var aSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Admin Options');
  if (!aSheet) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Admin Options' sheet is missing."
    };
  }

  var aData = aSheet.getDataRange().getValues();
  if (aData.length < 2) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Admin Options' sheet is missing data."
    };
  }

  var aHeaders = aData[0];
  var aNameCol = aHeaders.indexOf('Setting Name');
  var aValueCol = aHeaders.indexOf('Setting Value');

  if (aNameCol === -1 || aValueCol === -1) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "Missing required headers in 'Admin Options'."
    };
  }

  var globalTargetRaw = '';
  for (var i = 1; i < aData.length; i++) {
    if (aData[i][aNameCol] === 'Vacation Week Target Default') {
      globalTargetRaw = aData[i][aValueCol];
      break;
    }
  }

  var globalTarget = validateVacationTarget_(globalTargetRaw, true);

  if (globalTarget === null) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: 'Global vacation target is malformed in Admin Options.'
    };
  }

  var pSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Participant Config');
  if (!pSheet) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Participant Config' sheet is missing."
    };
  }

  var pData = pSheet.getDataRange().getValues();
  if (pData.length < 2) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Participant Config' sheet is missing data."
    };
  }

  var pHeaders = pData[0];
  var nameCol = pHeaders.indexOf('Name');
  var activeCol = pHeaders.indexOf('Active for Year');
  var enabledCol = pHeaders.indexOf('Vacation Phase Enabled');
  var targetOverrideCol = pHeaders.indexOf('Vacation Week Target Override');

  if (nameCol === -1 || activeCol === -1 || enabledCol === -1 || targetOverrideCol === -1) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "Missing required headers in 'Participant Config'."
    };
  }

  // Fetch all assigned vacation weeks to calculate current counts
  var vSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Vacation Availability');
  if (!vSheet) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Vacation Availability' sheet is missing."
    };
  }
  var vData = vSheet.getDataRange().getValues();
  if (vData.length < 2) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Vacation Availability' sheet is missing data."
    };
  }
  var vHeaders = vData[0];
  var weekIdCol = vHeaders.indexOf('Week ID');
  var startDateCol = vHeaders.indexOf('Start Date (Monday)');
  var assigneesCol = vHeaders.indexOf('Assigned Participants');

  if (assigneesCol === -1 || weekIdCol === -1 || startDateCol === -1) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "Missing required headers in 'Vacation Availability'."
    };
  }

  var participantCounts = {};
  var hasValidRows = false;

  for (var i = 1; i < vData.length; i++) {
    var assigneesStr = String(vData[i][assigneesCol] || '');
    var weekId = String(vData[i][weekIdCol] || '').trim();
    var startDate = vData[i][startDateCol];

    // Check entirely blank row
    if (!weekId && !startDate && !assigneesStr.trim()) {
      continue;
    }

    if (!weekId || !startDate) {
      return {
        status: 'SETUP_ERROR',
        remaining: null,
        reason: "Malformed row in 'Vacation Availability' at row " + (i + 1) + "."
      };
    }

    hasValidRows = true;

    if (assigneesStr) {
      var assignees = assigneesStr.split(',').map(function(s) { return s.trim(); });
      var uniqueAssignees = {};
      for (var j = 0; j < assignees.length; j++) {
        var aName = assignees[j];
        if (aName && !uniqueAssignees[aName]) {
          uniqueAssignees[aName] = true;
          participantCounts[aName] = (participantCounts[aName] || 0) + 1;
        }
      }
    }
  }

  if (!hasValidRows) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Vacation Availability' has no valid schedule rows."
    };
  }

  var remaining = 0;

  for (var i = 1; i < pData.length; i++) {
    // Check if it's a completely empty row
    var isTotallyBlank = true;
    for (var j = 0; j < pData[i].length; j++) {
      if (String(pData[i][j] || '').trim() !== '') {
        isTotallyBlank = false;
        break;
      }
    }
    if (isTotallyBlank) continue;

    var name = String(pData[i][nameCol] || '').trim();
    var isActive = pData[i][activeCol] === true || String(pData[i][activeCol] || '').toUpperCase() === 'TRUE';
    var isEnabled = pData[i][enabledCol] === true || String(pData[i][enabledCol] || '').toUpperCase() === 'TRUE';

    if (isActive && isEnabled) {
      if (!name) {
        return {
          status: 'SETUP_ERROR',
          remaining: null,
          reason: "Active and vacation-enabled participant row has no name at row " + (i + 1) + "."
        };
      }
      var overrideRaw = pData[i][targetOverrideCol];
      var target = validateVacationTarget_(overrideRaw, false);

      if (target === null) {
        return {
          status: 'SETUP_ERROR',
          remaining: null,
          reason: "Malformed vacation target override for participant: " + name
        };
      }

      if (target === -1) {
        target = globalTarget; // inherit
      }

      var currentCount = participantCounts[name] || 0;
      var deficit = target - currentCount;
      if (deficit > 0) {
        remaining += deficit;
      }
    }
  }

  return {
    status: remaining === 0 ? 'COMPLETE' : 'INCOMPLETE',
    remaining: remaining,
    reason: null
  };
}

/**
 * Calculates remaining unfilled official holidays.
 */
function getHolidayPhaseStatus() {
  var hSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Holiday Coverage');
  if (!hSheet) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Holiday Coverage' sheet is missing."
    };
  }

  var hData = hSheet.getDataRange().getValues();
  if (hData.length < 2) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Holiday Coverage' sheet is missing data."
    };
  }

  var hHeaders = hData[0];
  var dateCol = hHeaders.indexOf('Observed Date');
  var nameCol = hHeaders.indexOf('Holiday Name');
  var posCol = hHeaders.indexOf('Call Position (Call 1 / Call 2)');
  var assigneeCol = hHeaders.indexOf('Assigned Participant');

  if (dateCol === -1 || nameCol === -1 || posCol === -1 || assigneeCol === -1) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "Missing required headers in 'Holiday Coverage'."
    };
  }

  var remaining = 0;
  var hasValidRows = false;

  for (var i = 1; i < hData.length; i++) {
    // Check if it's a completely blank trailing row
    var dateVal = hData[i][dateCol];
    var nameVal = String(hData[i][nameCol] || '').trim();
    var posVal = String(hData[i][posCol] || '').trim();
    var assigneeVal = String(hData[i][assigneeCol] || '').trim();

    if (!dateVal && !nameVal && !posVal && !assigneeVal) {
      continue; // Skip entirely blank rows
    }

    // Evaluate validity of the row
    if (!dateVal || !nameVal || !posVal) {
      return {
        status: 'SETUP_ERROR',
        remaining: null,
        reason: "Malformed row in 'Holiday Coverage' at row " + (i + 1) + "."
      };
    }

    hasValidRows = true;

    if (!assigneeVal) {
      remaining++;
    }
  }

  if (!hasValidRows) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Holiday Coverage' has no valid schedule rows."
    };
  }

  return {
    status: remaining === 0 ? 'COMPLETE' : 'INCOMPLETE',
    remaining: remaining,
    reason: null
  };
}

/**
 * Calculates remaining unfilled weekends.
 */
function getWeekendPhaseStatus() {
  var wSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Weekend Coverage');
  if (!wSheet) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Weekend Coverage' sheet is missing."
    };
  }

  var wData = wSheet.getDataRange().getValues();
  if (wData.length < 2) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Weekend Coverage' sheet is missing data."
    };
  }

  var wHeaders = wData[0];
  var dateCol = wHeaders.indexOf('Date');
  var dayCol = wHeaders.indexOf('Day of Week');
  var firstCallCol = wHeaders.indexOf('First Call Assignee');

  if (dateCol === -1 || dayCol === -1 || firstCallCol === -1) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "Missing required headers in 'Weekend Coverage'."
    };
  }

  var remaining = 0;
  var hasValidRows = false;

  for (var i = 1; i < wData.length; i++) {
    var dateVal = wData[i][dateCol];
    var dayVal = String(wData[i][dayCol] || '').trim();
    var firstCallVal = String(wData[i][firstCallCol] || '').trim();

    // Check if it's a completely blank trailing row
    if (!dateVal && !dayVal && !firstCallVal) {
      continue;
    }

    // Validate date and day of week
    var isDateValid = (dateVal instanceof Date && !isNaN(dateVal.getTime())) ||
                      (String(dateVal).match(/^\d{4}-\d{2}-\d{2}/) && !isNaN(new Date(dateVal).getTime()));

    if (!dateVal || !dayVal || !isDateValid || (dayVal !== 'Saturday' && dayVal !== 'Sunday')) {
       return {
        status: 'SETUP_ERROR',
        remaining: null,
        reason: "Malformed row in 'Weekend Coverage' at row " + (i + 1) + "."
      };
    }

    hasValidRows = true;

    if (!firstCallVal) {
      remaining++;
    }
  }

  if (!hasValidRows) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "'Weekend Coverage' has no valid schedule rows."
    };
  }

  return {
    status: remaining === 0 ? 'COMPLETE' : 'INCOMPLETE',
    remaining: remaining,
    reason: null
  };
}
