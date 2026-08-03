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
