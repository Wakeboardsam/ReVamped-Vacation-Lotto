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
