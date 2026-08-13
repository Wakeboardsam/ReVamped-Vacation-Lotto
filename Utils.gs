/**
 * Date utility functions for Holiday calculations and date manipulations
 */

function getFirstMondayBeforeOrOn(date) {
  var d = new Date(date.getTime());
  var day = d.getDay();
  var daysToSubtract = (day === 0) ? 6 : (day - 1);
  d.setDate(d.getDate() - daysToSubtract);
  return d;
}

function getNthDayOfMonth(year, month, dayOfWeek, n) {
  var d = new Date(year, month, 1);
  var day = d.getDay();
  var diff = dayOfWeek - day;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() + diff + (n - 1) * 7);
  return d;
}

function getLastDayOfMonth(year, month, dayOfWeek) {
  var d = new Date(year, month + 1, 0); // last day of month
  var day = d.getDay();
  var diff = day - dayOfWeek;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() - diff);
  return d;
}

// Easter calculation (Computus)
function getEaster(year) {
  var f = Math.floor,
      G = year % 19,
      C = f(year / 100),
      H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30,
      I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11)),
      J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7,
      L = I - J,
      month = 3 + f((L + 40) / 44),
      day = L + 28 - 31 * f(month / 4);
  return new Date(year, month - 1, day);
}

function getHolidaysForYear(year) {
  return {
    "New Year's Day": new Date(year, 0, 1),
    "Memorial Day": getLastDayOfMonth(year, 4, 1), // Last Monday in May
    "Independence Day": new Date(year, 6, 4),
    "Labor Day": getNthDayOfMonth(year, 8, 1, 1), // 1st Monday in September
    "Thanksgiving": getNthDayOfMonth(year, 10, 4, 4), // 4th Thursday in November
    "Christmas": new Date(year, 11, 25)
  };
}

function getSoftHolidaysForYear(year) {
  return {
    "Presidents' Day": getNthDayOfMonth(year, 1, 1, 3), // 3rd Monday in February
    "Valentine's Day": new Date(year, 1, 14),
    "Easter": getEaster(year),
    "Mother's Day": getNthDayOfMonth(year, 4, 0, 2), // 2nd Sunday in May
    "Father's Day": getNthDayOfMonth(year, 5, 0, 3) // 3rd Sunday in June
  };
}

function getStartMondayForYear(year) {
  var jan1 = new Date(year, 0, 1);
  return getFirstMondayBeforeOrOn(jan1);
}

function getEndMondayForYear(year) {
  var dec31 = new Date(year, 11, 31);
  return getFirstMondayBeforeOrOn(dec31);
}

function formatDate(date) {
  var d = new Date(date);
  var month = '' + (d.getMonth() + 1);
  var day = '' + d.getDate();
  var year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
}

/**
 * Recursively sanitizes objects to ensure they are safe to return to the client via google.script.run.
 * Converts Date objects to strings, handles undefined, and passes through safe primitives.
 * @private
 */
function makeClientSafe_(obj) {
  if (obj === undefined) {
    return null;
  }
  if (obj === null || typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }
  if (Object.prototype.toString.call(obj) === '[object Date]') {
    return formatDate(obj);
  }
  if (Array.isArray(obj)) {
    var newArray = [];
    for (var i = 0; i < obj.length; i++) {
      newArray.push(makeClientSafe_(obj[i]));
    }
    return newArray;
  }
  if (typeof obj === 'object') {
    var newObj = {};
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = makeClientSafe_(obj[key]);
      }
    }
    return newObj;
  }
  // Fallback for functions, symbols, etc (though unexpected in standard spreadsheet data)
  return null;
}

/**
 * Adds enabled Soft Holiday Warnings to calendar rows.
 *
 * spanDays:
 *   0 = exact date only
 *   4 = Monday through Friday vacation week
 */
function attachSoftHolidayWarnings_(rows, dateField, spanDays) {
  var softRows = getSheetDataAsObjects('Soft Holiday Warnings');
  var enabledWarnings = [];

  for (var i = 0; i < softRows.length; i++) {
    var enabled = softRows[i]['Enabled'];
    var isEnabled =
      enabled === true ||
      String(enabled || '').trim().toUpperCase() === 'TRUE';

    if (!isEnabled) continue;

    var eventName = String(softRows[i]['Event Name'] || '').trim();
    var eventDate = softHolidayDateKey_(softRows[i]['Date']);
    var description = String(
      softRows[i]['Custom Description'] || ''
    ).trim();

    if (!eventName || !eventDate) continue;

    enabledWarnings.push({
      date: eventDate,
      label: eventName + (description ? ': ' + description : '')
    });
  }

  for (var r = 0; r < rows.length; r++) {
    var startDate = softHolidayDateKey_(rows[r][dateField]);
    var labels = [];

    if (startDate) {
      var endDate = addDaysToDateKey_(startDate, spanDays || 0);

      for (var w = 0; w < enabledWarnings.length; w++) {
        if (
          enabledWarnings[w].date >= startDate &&
          enabledWarnings[w].date <= endDate
        ) {
          labels.push(enabledWarnings[w].label);
        }
      }
    }

    rows[r].softHolidayWarnings = labels;
  }

  return rows;
}

/**
 * Converts a sheet Date or YYYY-MM-DD value to a stable date key.
 */
function softHolidayDateKey_(value) {
  if (!value) return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatDate(value);
  }

  var match = String(value).trim().match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  return match ? match[1] + '-' + match[2] + '-' + match[3] : '';
}

/**
 * Adds calendar days without DST or timezone shifting.
 */
function addDaysToDateKey_(dateKey, days) {
  var parts = dateKey.split('-');

  var date = new Date(Date.UTC(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2]) + Number(days || 0)
  ));

  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

/**
 * Returns true when at least one official holiday call position is still open.
 */
function hasOpenHolidayPositions_() {
  var holidays = getSheetDataAsObjects('Holiday Coverage');

  for (var i = 0; i < holidays.length; i++) {
    if (!String(holidays[i]['Assigned Participant'] || '').trim()) {
      return true;
    }
  }

  return false;
}

/**
 * Prevent one participant from holding both Call 1 and Call 2
 * for the same holiday.
 */
function participantAlreadyHasHoliday_(participantName, holidayName, holidayData, holidayHeaders) {
  var nameCol = holidayHeaders.indexOf('Holiday Name');
  var assigneeCol = holidayHeaders.indexOf('Assigned Participant');

  for (var i = 1; i < holidayData.length; i++) {
    if (
      String(holidayData[i][nameCol]) === String(holidayName) &&
      String(holidayData[i][assigneeCol]).trim() === String(participantName).trim()
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Return a stable weekend key for either Saturday or Sunday.
 * Both days of the same weekend produce the same Saturday YYYY-MM-DD key.
 */
function getWeekendKey_(dateValue) {
  var d;

  if (dateValue instanceof Date) {
    d = new Date(
      dateValue.getFullYear(),
      dateValue.getMonth(),
      dateValue.getDate()
    );
  } else {
    var parts = String(dateValue).split('-');
    if (parts.length !== 3) return '';

    d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    );
  }

  var day = d.getDay();

  // Saturday = 6, Sunday = 0
  if (day === 0) {
    d.setDate(d.getDate() - 1);
  } else if (day !== 6) {
    return '';
  }

  return formatDate(d);
}

/**
 * Prevent one participant from holding Saturday AND Sunday
 * First Call of the same weekend.
 */
function participantAlreadyHasWeekend_(participantName, selectedDate, weekendData, weekendHeaders) {
  var selectedWeekendKey = getWeekendKey_(selectedDate);
  var dateCol = weekendHeaders.indexOf('Date');
  var assigneeCol = weekendHeaders.indexOf('First Call Assignee');

  if (!selectedWeekendKey) return false;

  for (var i = 1; i < weekendData.length; i++) {
    var assignee = String(weekendData[i][assigneeCol] || '').trim();

    if (
      assignee === String(participantName).trim() &&
      getWeekendKey_(weekendData[i][dateCol]) === selectedWeekendKey
    ) {
      return true;
    }
  }

  return false;
}
