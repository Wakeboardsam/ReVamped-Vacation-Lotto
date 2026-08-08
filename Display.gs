/**
 * Safe Public Display API and Read-Only Queue Snapshot
 * Provides a consolidated, intentionally public, read-only snapshot for the UI.
 */

function getPublicDisplaySnapshot() {
  try {
    var adminOptions = getAdminOptions();
    var state = getQueueState();
    var phase = state.phase;

    var queueSnapshot = getPublicQueueSnapshot_(phase, adminOptions);

    var participantNames = [];
    var namesSeen = {};

    var participants = queueSnapshot.participants;
    for (var i = 0; i < participants.length; i++) {
      var rawName = participants[i]['Name'];
      if (!rawName) continue;

      var trimmed = String(rawName).trim();
      if (!trimmed) continue;

      var lower = trimmed.toLowerCase();
      if (!namesSeen[lower]) {
        namesSeen[lower] = true;
        participantNames.push(trimmed);
      }
    }

    participantNames.sort(function(a, b) {
      var lowerA = a.toLowerCase();
      var lowerB = b.toLowerCase();
      if (lowerA < lowerB) return -1;
      if (lowerA > lowerB) return 1;
      return 0;
    });

    var calendar = {
      supported: false,
      kind: "NONE",
      unsupportedReason: "",
      vacationWeeks: [],
      weekends: [],
      holidays: []
    };

    if (phase === 'VACATION_SENIORITY' || phase === 'VACATION_RANDOM') {
      calendar.supported = true;
      calendar.kind = "VACATION";

      var calendarData = queueSnapshot.calendarData;
      for (var i = 0; i < calendarData.length; i++) {
        var row = calendarData[i];
        var weekId = String(row['Week ID'] || '');
        var startDate = row['Start Date (Monday)'];

        var capacityRaw = parseInt(row['Capacity']);
        var capacity = isNaN(capacityRaw) ? parseInt(adminOptions['Vacation Weekly Capacity']) || 4 : capacityRaw;

        var assignedNamesStr = String(row['Assigned Participants'] || '');
        var assignedNames = [];
        if (assignedNamesStr) {
          var splitNames = assignedNamesStr.split(',');
          for (var j = 0; j < splitNames.length; j++) {
            var n = splitNames[j].trim();
            if (n) assignedNames.push(n);
          }
        }
        var assignedCount = assignedNames.length;
        var remainingCapacity = Math.max(0, capacity - assignedCount);

        calendar.vacationWeeks.push({
          weekId: weekId,
          startDate: startDate,
          capacity: capacity,
          assignedCount: assignedCount,
          remainingCapacity: remainingCapacity,
          primeClassification: String(row['Prime Classification'] || ''),
          specialWeekDesignation: String(row['Special Week Designation'] || ''),
          assignedNames: assignedNames
        });
      }
    } else if (phase === 'WEEKEND') {
      calendar.supported = true;
      calendar.kind = "WEEKEND";

      var calendarData = queueSnapshot.calendarData;
      for (var i = 0; i < calendarData.length; i++) {
        var row = calendarData[i];
        var assignedNames = [];
        var fca = String(row['First Call Assignee'] || '').trim();
        if (fca) assignedNames.push(fca);

        var assignedCount = assignedNames.length;
        var capacity = 1;
        var remainingCapacity = Math.max(0, capacity - assignedCount);

        calendar.weekends.push({
          date: row['Date'],
          dayOfWeek: String(row['Day of Week'] || ''),
          capacity: capacity,
          assignedCount: assignedCount,
          remainingCapacity: remainingCapacity,
          assignedNames: assignedNames,
          vacationAdjacencyWarning: String(row['Vacation Adjacency Warning'] || ''),
          holidayProximityWarning: String(row['Holiday Proximity Warning'] || '')
        });
      }

      var holidayData = queueSnapshot.holidayData;
      for (var i = 0; i < holidayData.length; i++) {
        var row = holidayData[i];
        var assignedNames = [];
        var ap = String(row['Assigned Participant'] || '').trim();
        if (ap) assignedNames.push(ap);

        var assignedCount = assignedNames.length;
        var capacity = 1;
        var remainingCapacity = Math.max(0, capacity - assignedCount);

        calendar.holidays.push({
          holidayName: String(row['Holiday Name'] || ''),
          observedDate: row['Observed Date'],
          callPosition: String(row['Call Position (Call 1 / Call 2)'] || ''),
          capacity: capacity,
          assignedCount: assignedCount,
          remainingCapacity: remainingCapacity,
          assignedNames: assignedNames
        });
      }

    } else if (phase === 'HOLIDAY_VOLUNTEER' || phase === 'HOLIDAY_MANDATORY') {
      calendar.supported = true;
      calendar.kind = "HOLIDAY";

      var calendarData = queueSnapshot.calendarData;
      for (var i = 0; i < calendarData.length; i++) {
        var row = calendarData[i];
        var assignedNames = [];
        var ap = String(row['Assigned Participant'] || '').trim();
        if (ap) assignedNames.push(ap);

        var assignedCount = assignedNames.length;
        var capacity = 1;
        var remainingCapacity = Math.max(0, capacity - assignedCount);

        calendar.holidays.push({
          holidayName: String(row['Holiday Name'] || ''),
          observedDate: row['Observed Date'],
          callPosition: String(row['Call Position (Call 1 / Call 2)'] || ''),
          capacity: capacity,
          assignedCount: assignedCount,
          remainingCapacity: remainingCapacity,
          assignedNames: assignedNames
        });
      }
    } else {
      calendar.unsupportedReason = "A calendar display is not available for the current phase.";
    }

    var result = {
      success: true,
      generatedAt: new Date().toISOString(),
      activeYear: String(adminOptions['Active Year'] || ''),
      phase: state.phase,
      round: state.round,
      direction: state.direction,
      queue: {
        activeWindowSize: queueSnapshot.windowSize,
        activeNames: queueSnapshot.activeNames,
        upNextNames: queueSnapshot.upNextNames
      },
      participantNames: participantNames,
      calendar: calendar
    };

    return makeClientSafe_(result);

  } catch (e) {
    // Log exception server-side
    console.error(e);
    return {
      success: false,
      error: "Display data is temporarily unavailable."
    };
  }
}
