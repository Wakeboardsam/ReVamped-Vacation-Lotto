/**
 * Admin.gs - Admin utilities for initialization and randomization
 */

function autoFillAndRandomize(targetYear) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Generate Vacation Weeks
  var vacationSheet = ss.getSheetByName('Vacation Availability');
  if (vacationSheet) {
    var startMonday = getStartMondayForYear(targetYear);
    var endMonday = getEndMondayForYear(targetYear);
    var currentMonday = new Date(startMonday.getTime());
    var vacationData = [];
    var weekId = 1;

    while (currentMonday <= endMonday) {
      vacationData.push([
        weekId,
        formatDate(currentMonday),
        '', // Capacity
        '', // Prime Classification
        '', // Special Week Designation
        ''  // Assigned Participants
      ]);
      currentMonday.setDate(currentMonday.getDate() + 7);
      weekId++;
    }

    if (vacationData.length > 0) {
      // Clear existing data (keep headers)
      if (vacationSheet.getLastRow() > 1) {
        vacationSheet.getRange(2, 1, vacationSheet.getLastRow() - 1, vacationSheet.getLastColumn()).clearContent();
      }
      vacationSheet.getRange(2, 1, vacationData.length, vacationData[0].length).setValues(vacationData);
    }
  }

  // 2. Generate Weekends
  var weekendSheet = ss.getSheetByName('Weekend Coverage');
  if (weekendSheet) {
    var startDate = new Date(targetYear, 0, 1);
    var endDate = new Date(targetYear, 11, 31);
    var currentDate = new Date(startDate.getTime());
    var weekendData = [];

    while (currentDate <= endDate) {
      var dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
        weekendData.push([
          formatDate(currentDate),
          dayOfWeek === 0 ? 'Sunday' : 'Saturday',
          '', // First Call Assignee
          '', // Vacation Adjacency Warning
          ''  // Holiday Proximity Warning
        ]);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (weekendData.length > 0) {
      if (weekendSheet.getLastRow() > 1) {
        weekendSheet.getRange(2, 1, weekendSheet.getLastRow() - 1, weekendSheet.getLastColumn()).clearContent();
      }
      weekendSheet.getRange(2, 1, weekendData.length, weekendData[0].length).setValues(weekendData);
    }
  }

  // 3. Generate Official Holidays (Call 1 and Call 2)
  var holidaySheet = ss.getSheetByName('Holiday Coverage');
  if (holidaySheet) {
    var holidays = getHolidaysForYear(targetYear);
    var holidayData = [];

    for (var hName in holidays) {
      if (holidays.hasOwnProperty(hName)) {
        var hDate = formatDate(holidays[hName]);
        holidayData.push([hName, hDate, 'Call 1', '']);
        holidayData.push([hName, hDate, 'Call 2', '']);
      }
    }

    if (holidayData.length > 0) {
      if (holidaySheet.getLastRow() > 1) {
        holidaySheet.getRange(2, 1, holidaySheet.getLastRow() - 1, holidaySheet.getLastColumn()).clearContent();
      }
      holidaySheet.getRange(2, 1, holidayData.length, holidayData[0].length).setValues(holidayData);
    }
  }

  // 4. Generate Soft Holidays
  var softHolidaySheet = ss.getSheetByName('Soft Holiday Warnings');
  if (softHolidaySheet) {
    var softHolidays = getSoftHolidaysForYear(targetYear);
    var softHolidayData = [];

    for (var sName in softHolidays) {
      if (softHolidays.hasOwnProperty(sName)) {
        softHolidayData.push([
          sName,
          formatDate(softHolidays[sName]),
          'TRUE',
          '' // Custom Description
        ]);
      }
    }

    if (softHolidayData.length > 0) {
      if (softHolidaySheet.getLastRow() > 1) {
        softHolidaySheet.getRange(2, 1, softHolidaySheet.getLastRow() - 1, softHolidaySheet.getLastColumn()).clearContent();
      }
      softHolidaySheet.getRange(2, 1, softHolidayData.length, softHolidayData[0].length).setValues(softHolidayData);
    }
  }

  // 5. Randomize Participants (Lottery Position)
  var participantSheet = ss.getSheetByName('Participant Config');
  if (participantSheet && participantSheet.getLastRow() > 1) {
    var headers = participantSheet.getRange(1, 1, 1, participantSheet.getLastColumn()).getValues()[0];
    var activeColIdx = headers.indexOf('Active for Year');
    var lotteryPosColIdx = headers.indexOf('Lottery Position');

    if (activeColIdx !== -1 && lotteryPosColIdx !== -1) {
      var dataRange = participantSheet.getRange(2, 1, participantSheet.getLastRow() - 1, participantSheet.getLastColumn());
      var data = dataRange.getValues();

      var activeParticipants = [];
      for (var i = 0; i < data.length; i++) {
        // Clear old lottery position first
        data[i][lotteryPosColIdx] = '';
        if (data[i][activeColIdx] === true || data[i][activeColIdx] === 'TRUE') {
          activeParticipants.push({
            originalIndex: i
          });
        }
      }

      // Shuffle active participants
      for (var i = activeParticipants.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = activeParticipants[i];
        activeParticipants[i] = activeParticipants[j];
        activeParticipants[j] = temp;
      }

      // Assign Lottery Position (1 to N)
      for (var i = 0; i < activeParticipants.length; i++) {
        var origIdx = activeParticipants[i].originalIndex;
        data[origIdx][lotteryPosColIdx] = i + 1;
      }

      // Write back to sheet
      dataRange.setValues(data);
    }
  }

  // Set Active Year in Admin Options
  setAdminOptions({ 'Active Year': targetYear });
}
