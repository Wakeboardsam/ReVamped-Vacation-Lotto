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
  var adminOptions = getAdminOptions();
  var globalTargetRaw = adminOptions['Vacation Week Target Default'];
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
  var assigneesCol = vHeaders.indexOf('Assigned Participants');
  if (assigneesCol === -1) {
    return {
      status: 'SETUP_ERROR',
      remaining: null,
      reason: "Missing 'Assigned Participants' header in 'Vacation Availability'."
    };
  }

  var participantCounts = {};
  for (var i = 1; i < vData.length; i++) {
    var assigneesStr = String(vData[i][assigneesCol] || '');
    if (assigneesStr) {
      var assignees = assigneesStr.split(',').map(function(s) { return s.trim(); });
      for (var j = 0; j < assignees.length; j++) {
        var name = assignees[j];
        if (name) {
          participantCounts[name] = (participantCounts[name] || 0) + 1;
        }
      }
    }
  }

  var remaining = 0;

  for (var i = 1; i < pData.length; i++) {
    var name = String(pData[i][nameCol] || '').trim();
    if (!name) continue; // Skip totally empty rows

    var isActive = pData[i][activeCol] === true || String(pData[i][activeCol] || '').toUpperCase() === 'TRUE';
    var isEnabled = pData[i][enabledCol] === true || String(pData[i][enabledCol] || '').toUpperCase() === 'TRUE';

    if (isActive && isEnabled) {
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
  var dateCol = hHeaders.indexOf('Date');
  var nameCol = hHeaders.indexOf('Holiday Name');
  var posCol = hHeaders.indexOf('Call Position');
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

    // Check for malformed row (missing date or day)
    if (!dateVal || !dayVal) {
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
