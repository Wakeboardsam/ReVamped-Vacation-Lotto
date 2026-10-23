/**
 * Archive.gs - Year stamp and Lottery Archive
 *
 * The working tabs hold one lottery year at a time. "Tabs Year" on the Config tab records
 * which year that is. The Lottery Archive tab keeps every past year's final assignments
 * (after transfers), one row per assignment. The archive is append-only: a year that is
 * already archived is never replaced.
 */

var LOTTERY_ARCHIVE_SHEET_NAME = 'Lottery Archive';
var LOTTERY_ARCHIVE_HEADERS = [
  'Year', 'Assignment Type', 'Date', 'Position / Designation', 'Participant', 'Details', 'Archived On'
];

/**
 * The lottery year the working tabs hold, from "Tabs Year" on the Config tab,
 * or null when no year has been stamped yet.
 */
function getTabsYear_() {
  return parseLotteryYear_(getSystemConfig()['Tabs Year']);
}

/**
 * Stamps the working tabs with a lottery year. Refuses anything but a four-digit year.
 */
function setTabsYear_(year) {
  var parsed = parseLotteryYear_(year);
  if (!parsed) throw new Error('The tabs year must be a four-digit year.');
  setSystemConfig({ 'Tabs Year': parsed });
}

/**
 * Returns the Lottery Archive sheet, creating it with its headers when missing.
 */
function getOrCreateLotteryArchiveSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LOTTERY_ARCHIVE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOTTERY_ARCHIVE_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOTTERY_ARCHIVE_HEADERS);
    sheet.getRange(1, 1, 1, LOTTERY_ARCHIVE_HEADERS.length).setFontWeight('bold').setBackground('#f3f3f3');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * True when the Lottery Archive already holds rows for the given year.
 */
function isLotteryYearArchived_(year) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOTTERY_ARCHIVE_SHEET_NAME);
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return false;
  var yearIdx = data[0].indexOf('Year');
  if (yearIdx === -1) return false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][yearIdx]) === String(year)) return true;
  }
  return false;
}

/**
 * Builds one archive row per final assignment in the working tabs for the given year:
 * vacation weeks, holiday calls, weekend days, and that year's Transfer History.
 * Reads only; writes nothing.
 */
function buildLotteryArchiveRows_(year) {
  var archivedOn = new Date();
  var rows = [];
  function addRow(type, date, position, participant, details) {
    rows.push([year, type, date, position, participant, details, archivedOn]);
  }

  var vacations = getSheetDataAsObjects('Vacation Availability');
  for (var v = 0; v < vacations.length; v++) {
    var assignees = String(vacations[v]['Assigned Participants'] || '').split(',');
    var designation = String(vacations[v]['Special Week Designation'] || '').trim();
    var labels = [];
    if (designation && designation !== 'None') labels.push(designation);
    if (String(vacations[v]['Prime Classification'] || '').trim() === 'Prime') labels.push('Prime');
    for (var a = 0; a < assignees.length; a++) {
      var vacName = assignees[a].trim();
      if (!vacName) continue;
      addRow('Vacation', normalizeDateKey_(vacations[v]['Start Date (Monday)']), labels.join(', '), vacName,
          'Week ' + vacations[v]['Week ID']);
    }
  }

  var holidays = getSheetDataAsObjects('Holiday Coverage');
  for (var h = 0; h < holidays.length; h++) {
    var holName = String(holidays[h]['Assigned Participant'] || '').trim();
    if (!holName) continue;
    addRow('Holiday', normalizeDateKey_(holidays[h]['Observed Date']),
        String(holidays[h]['Call Position (Call 1 / Call 2)'] || ''), holName, String(holidays[h]['Holiday Name'] || ''));
  }

  var weekends = getSheetDataAsObjects('Weekend Coverage');
  for (var w = 0; w < weekends.length; w++) {
    var wkName = String(weekends[w]['First Call Assignee'] || '').trim();
    if (!wkName) continue;
    addRow('Weekend', normalizeDateKey_(weekends[w]['Date']), String(weekends[w]['Day of Week'] || ''), wkName, '');
  }

  var transfers = getSheetDataAsObjects('Transfer History');
  for (var t = 0; t < transfers.length; t++) {
    if (String(transfers[t]['Year']) !== String(year)) continue;
    var newAssignee = String(transfers[t]['New Assignee'] || '').trim();
    if (!newAssignee) continue;
    // Weekend transfers carry a date; holiday transfers carry "Holiday Name - Call N".
    var rawDate = transfers[t]['Assignment Date'];
    var dateKey = normalizeDateKey_(rawDate);
    var position = String(transfers[t]['Call Position/Day'] || '') || (dateKey ? '' : String(rawDate || ''));
    addRow('Transfer', dateKey, position, newAssignee,
        String(transfers[t]['Assignment Type'] || '') + ' from ' + String(transfers[t]['Original Assignee'] || ''));
  }

  return rows;
}

/**
 * Copies the final assignments of the given lottery year from the working tabs into the
 * Lottery Archive. Append-only and safe to call twice:
 * - refuses unless the year is a four-digit year and the tabs are stamped with it;
 * - adds nothing when the archive already holds that year;
 * - refuses when the working tabs hold no assignments, so empty tabs never become history.
 * Callers that change other tabs in the same step hold withScriptLock themselves.
 * @return {{year: number, archived: number, alreadyArchived: boolean}}
 */
function archiveLotteryYear_(year) {
  var parsed = parseLotteryYear_(year);
  if (!parsed) throw new Error('Archiving needs a four-digit lottery year.');

  var tabsYear = getTabsYear_();
  if (tabsYear !== parsed) {
    throw new Error('The working tabs hold ' + (tabsYear || 'no stamped year') + ', not ' + parsed + '. Nothing was archived.');
  }

  if (isLotteryYearArchived_(parsed)) {
    return { year: parsed, archived: 0, alreadyArchived: true };
  }

  var rows = buildLotteryArchiveRows_(parsed);
  if (rows.length === 0) {
    throw new Error('The working tabs hold no assignments for ' + parsed + '. Nothing was archived.');
  }

  var sheet = getOrCreateLotteryArchiveSheet_();
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOTTERY_ARCHIVE_HEADERS.length).setValues(rows);
  return { year: parsed, archived: rows.length, alreadyArchived: false };
}

/** Working tabs whose data rows are cleared when a new lottery year is set up. */
var NEW_YEAR_CLEARED_TABS = [
  'Vacation Availability', 'Weekend Coverage', 'Holiday Coverage',
  'Soft Holiday Warnings', 'Transfer Offers', 'Transfer History'
];

/** Yearly Participant Config fields and the value each is reset to for a new year. */
var NEW_YEAR_ROSTER_RESETS = {
  'Lottery Position': '',
  'Holiday Volunteer Response': '',
  'Transfer Giver': true,
  'Transfer Receiver': true,
  'Rules Acknowledged Year': '',
  'Transfer Offers Submitted': false,
  'Skipped Turns Remaining': 0,
  'Entry Timestamp': '',
  'Reminder Sent': false,
  'Admin Alert Sent': false,
  'Resend WhatsApp': false,
  'On Deck Event Key': ''
};

/** Last-year boxes and the archived vacation designation that checks each one. */
var LAST_YEAR_WEEK_BOXES = {
  'Had Spring Break Last Year': 'Spring Break',
  'Had Thanksgiving Week Last Year': 'Thanksgiving',
  'Had Christmas Week Last Year': 'Christmas'
};

/**
 * Best guess at the year unstamped tabs hold: the most common year among Weekend Coverage dates.
 * Returns null when there are no weekend dates.
 */
function guessTabsYearFromWeekends_() {
  var counts = {};
  var weekends = getSheetDataAsObjects('Weekend Coverage');
  for (var i = 0; i < weekends.length; i++) {
    var key = normalizeDateKey_(weekends[i]['Date']);
    if (key) counts[key.slice(0, 4)] = (counts[key.slice(0, 4)] || 0) + 1;
  }
  var best = null;
  for (var y in counts) {
    if (counts.hasOwnProperty(y) && (best === null || counts[y] > counts[best])) best = y;
  }
  return best === null ? null : Number(best);
}

/**
 * Sets the four last-year boxes on Participant Config from the archived assignments of one year:
 * "Worked Any Official Holiday Last Year" for anyone holding a holiday call, and each
 * "Had ... Last Year" box for anyone assigned to the week with that designation.
 * Returns false and changes nothing when the archive holds no rows for that year.
 */
function applyLastYearBoxesFromArchive_(lastYear) {
  if (!isLotteryYearArchived_(lastYear)) return false;

  var holidayWorkers = {};
  var weekHolders = {};
  var archived = getSheetDataAsObjects(LOTTERY_ARCHIVE_SHEET_NAME);
  for (var i = 0; i < archived.length; i++) {
    if (String(archived[i]['Year']) !== String(lastYear)) continue;
    var name = String(archived[i]['Participant'] || '').trim();
    if (!name) continue;
    if (archived[i]['Assignment Type'] === 'Holiday') holidayWorkers[name] = true;
    if (archived[i]['Assignment Type'] === 'Vacation') {
      var labels = String(archived[i]['Position / Designation'] || '').split(',');
      for (var l = 0; l < labels.length; l++) {
        var label = labels[l].trim();
        if (label) weekHolders[label + '|' + name] = true;
      }
    }
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Participant Config');
  if (!sheet || sheet.getLastRow() < 2) return true;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
  var data = range.getValues();
  var nameIdx = headers.indexOf('Name');
  var holidayIdx = headers.indexOf('Worked Any Official Holiday Last Year');
  for (var r = 0; r < data.length; r++) {
    var person = String(data[r][nameIdx] || '').trim();
    if (!person) continue;
    if (holidayIdx !== -1) data[r][holidayIdx] = !!holidayWorkers[person];
    for (var box in LAST_YEAR_WEEK_BOXES) {
      if (!LAST_YEAR_WEEK_BOXES.hasOwnProperty(box)) continue;
      var boxIdx = headers.indexOf(box);
      if (boxIdx !== -1) data[r][boxIdx] = !!weekHolders[LAST_YEAR_WEEK_BOXES[box] + '|' + person];
    }
  }
  range.setValues(data);
  return true;
}

/**
 * Moves the workbook from oldYear to newYear. The steps run in an order that is safe to rerun
 * after a failure part-way: archive first (skipped when oldYear is already archived), the new
 * stamp last, so until the end the tabs still count as oldYear.
 * oldYear may be null for tabs that never held a stamped year; nothing is archived then.
 * Callers hold withScriptLock and have already confirmed with the admin.
 * @return {{archived: number, alreadyArchived: boolean, participantsReset: number, lastYearBoxesSet: boolean}}
 */
function startNewLotteryYear_(oldYear, newYear) {
  var target = parseLotteryYear_(newYear);
  if (!target) throw new Error('Set Active Year (Admin Options, B2) to the new lottery year first. Nothing was changed.');
  var previous = oldYear ? parseLotteryYear_(oldYear) : null;
  if (oldYear && !previous) throw new Error('The old lottery year must be a four-digit year. Nothing was changed.');
  if (previous && previous >= target) {
    throw new Error('The new lottery year must be after ' + previous + '. Nothing was changed.');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var summary = { archived: 0, alreadyArchived: false, participantsReset: 0, lastYearBoxesSet: false };

  // 1. Archive the old year, unless it is already in the archive.
  if (previous) {
    if (getTabsYear_() !== previous) setTabsYear_(previous); // first rollover of an unstamped workbook
    if (isLotteryYearArchived_(previous)) {
      summary.alreadyArchived = true;
    } else if (buildLotteryArchiveRows_(previous).length > 0) {
      summary.archived = archiveLotteryYear_(previous).archived;
    }
  }

  // 2. Clear the data rows of the working tabs; headers stay.
  for (var t = 0; t < NEW_YEAR_CLEARED_TABS.length; t++) {
    var sheet = ss.getSheetByName(NEW_YEAR_CLEARED_TABS[t]);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
  }

  // 3. Back to setup: no one is active, the notification trigger sends nothing,
  //    and an open participant page is told to refresh.
  setQueueState({ phase: 'SETUP_EMPTY', round: 1, direction: 'ASCENDING', lead: 1 });

  // 4. Reset the yearly roster fields. Names, PINs, phones, seniority, switches and caps stay.
  var pSheet = ss.getSheetByName('Participant Config');
  if (pSheet && pSheet.getLastRow() > 1) {
    var pHeaders = pSheet.getRange(1, 1, 1, pSheet.getLastColumn()).getValues()[0];
    var pRange = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn());
    var pData = pRange.getValues();
    var nameIdx = pHeaders.indexOf('Name');
    for (var r = 0; r < pData.length; r++) {
      if (!String(pData[r][nameIdx] || '').trim()) continue;
      for (var field in NEW_YEAR_ROSTER_RESETS) {
        if (!NEW_YEAR_ROSTER_RESETS.hasOwnProperty(field)) continue;
        var idx = pHeaders.indexOf(field);
        if (idx !== -1) pData[r][idx] = NEW_YEAR_ROSTER_RESETS[field];
      }
      summary.participantsReset++;
    }
    pRange.setValues(pData);
  }

  // 5. Pre-check the last-year boxes from the archive; leave them alone when that year is missing.
  summary.lastYearBoxesSet = applyLastYearBoxesFromArchive_(target - 1);

  // 6. Stamp the new year last.
  setTabsYear_(target);
  return summary;
}

/**
 * Menu: 📅 Archive Current Year & Set Up New Lottery Year.
 * Checks the years, shows one confirmation that says what will happen, then runs the rollover.
 */
function runNewLotteryYearFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var newYear = getActiveLotteryYear_();
  if (!newYear) {
    ui.alert('Enter the new lottery year in Admin Options (Active Year, B2) first. Nothing was changed.');
    return;
  }

  var oldYear = getTabsYear_();
  var stampNote = '';
  if (!oldYear) {
    var guessed = guessTabsYearFromWeekends_();
    if (guessed) {
      var guessAnswer = ui.alert('Which year do the tabs hold?',
          'The tabs have no year stamp yet. Their weekend dates are in ' + guessed + '.\n\n' +
          'Treat the current tabs as the ' + guessed + ' lottery?', ui.ButtonSet.YES_NO);
      if (guessAnswer !== ui.Button.YES) {
        ui.alert('Nothing was changed.');
        return;
      }
      oldYear = guessed;
    } else {
      stampNote = 'The tabs have no year stamp and no weekend dates, so there is nothing to archive.\n\n';
    }
  }

  if (oldYear && oldYear >= newYear) {
    ui.alert('The tabs already hold the ' + oldYear + ' lottery. To start a new year, set Active Year (B2) to a later year. Nothing was changed.');
    return;
  }

  var alreadyArchived = oldYear ? isLotteryYearArchived_(oldYear) : false;
  var toArchive = oldYear && !alreadyArchived ? buildLotteryArchiveRows_(oldYear).length : 0;
  var phase = getQueueState().phase;
  var unfinished = phase !== 'COMPLETE' && !/^SETUP/.test(String(phase || 'SETUP'));

  var message = (unfinished ? 'Warning: the current lottery is not finished. It is in: ' + getPhaseDisplayName_(phase) + '.\n\n' : '') +
      stampNote +
      'This will:\n' +
      (oldYear ? (alreadyArchived ? '• Keep the ' + oldYear + ' archive as it is (already archived)\n'
                                  : '• Copy ' + toArchive + ' final ' + oldYear + ' assignments to Lottery Archive\n') : '') +
      '• Clear Vacation Availability, Weekend Coverage, Holiday Coverage, Soft Holiday Warnings, Transfer Offers and Transfer History\n' +
      '• Reset the lottery phase to setup\n' +
      '• Reset yearly roster fields (Lottery Position, volunteer and transfer answers, rules acknowledgment, turn and notification tracking)\n' +
      '• Set the last-year boxes from the ' + (newYear - 1) + ' archive\n' +
      '• Mark the tabs as the ' + newYear + ' lottery\n\n' +
      'Names, PINs, phone numbers, seniority and per-person caps stay.\n\n' +
      'Tip: make a backup first with File → Make a copy.\n\n' +
      'Continue?';
  var answer = ui.alert('Archive ' + (oldYear || 'current tabs') + ' and set up ' + newYear + '?', message, ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) {
    ui.alert('Nothing was changed.');
    return;
  }

  var summary = withScriptLock(function() { return startNewLotteryYear_(oldYear, newYear); });
  sanitizeParticipantConfigSheet();

  ui.alert('The tabs are set up for the ' + newYear + ' lottery.\n\n' +
      (oldYear ? (summary.alreadyArchived ? '✓ ' + oldYear + ' was already archived\n' : '✓ ' + summary.archived + ' assignments archived for ' + oldYear + '\n') : '') +
      '✓ Working tabs cleared\n' +
      '✓ ' + summary.participantsReset + ' participants reset for the new year\n' +
      (summary.lastYearBoxesSet ? '✓ Last-year boxes set from the ' + (newYear - 1) + ' archive\n'
                                : '• No ' + (newYear - 1) + ' archive found, so the last-year boxes were left as they were. Check them by hand.\n') +
      '\nNext: review the last-year boxes, then run 🎲 Auto-Fill & Randomize Roster.');
}
