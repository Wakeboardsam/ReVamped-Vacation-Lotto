/**
 * Schema.gs - Database initialization
 */

function setupDatabaseSchema() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var schemas = [
    {
      name: 'Admin Options',
      headers: ['Setting Name', 'Setting Value', 'Description'],
      warning: 'WARNING: Twilio credentials below are visible to sheet editors. Handle with care!',
      defaultData: [
        ['Active Year', '', 'The target year for the lottery'],
        ['Vacation Window Size (mins)', '1440', 'Duration of a vacation pick window'],
        ['Weekend Window Size (mins)', '1440', 'Duration of a weekend pick window'],
        ['Holiday Window Size (mins)', '1440', 'Duration of a holiday pick window'],
        ['Transfer Window Size (mins)', '1440', 'Duration of a transfer offer window'],
        ['Vacation Active Window (participants)', '3', 'Number of participants active at once for vacation'],
        ['Weekend Active Window (participants)', '2', 'Number of participants active at once for weekends'],
        ['Holiday Active Window (participants)', '2', 'Number of participants active at once for holidays'],
        ['Transfer Active Window (participants)', '2', 'Number of participants active at once for transfers'],
        ['Enable SMS Notifications', 'FALSE', 'Toggle to enable/disable SMS'],
        ['Reminder Delay (mins)', '360', 'Delay before sending a reminder SMS'],
        ['Admin Alert Delay (mins)', '720', 'Delay before sending admin an alert SMS'],
        ['Holiday Proximity Range (days)', '3', 'Range for holiday proximity warning'],
        ['Admin Phone Number', '', 'Phone number for admin alerts'],
        ['Twilio Account SID', '', 'Your Twilio Account SID'],
        ['Twilio Auth Token', '', 'Your Twilio Auth Token'],
        ['Twilio Sender Phone', '', 'Your Twilio Sender Phone Number'],
        ['Prompt Text - Vacation', 'It is your turn to pick a vacation week.', 'Message sent when vacation turn starts'],
        ['Prompt Text - Weekend', 'It is your turn to pick a weekend.', 'Message sent when weekend turn starts'],
        ['Prompt Text - Holiday', 'It is your turn to pick a holiday assignment.', 'Message sent when holiday turn starts'],
        ['Prompt Text - Transfer', 'It is your turn to select an available transfer.', 'Message sent when transfer turn starts'],
        ['Web App URL', '', 'The public URL for the participant web interface']
      ]
    },
    {
      name: 'Rules & Tips',
      headers: ['Section Key', 'Display Text']
    },
    {
      name: 'Participant Config',
      headers: [
        'Name', 'PIN', 'Phone Number', 'Seniority Position', 'Lottery Position',
        'Active for Year', 'Vacation Phase Enabled', 'Vacation Week Target Override',
        'Weekend Phase Enabled', 'Weekend Assignment Maximum', 'Holiday Volunteer Response',
        'Mandatory Holiday Eligible', 'Transfer Giver', 'Transfer Receiver',
        'Had Spring Break Last Year', 'Had Christmas Week Last Year',
        'Worked Any Official Holiday Last Year', 'Rules Acknowledged Year', 'Transfer Offers Submitted',
        'Skipped Turns Remaining', 'Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent',
        'Resend WhatsApp'
      ]
    },
    {
      name: 'Vacation Availability',
      headers: [
        'Week ID', 'Start Date (Monday)', 'Capacity', 'Prime Classification',
        'Special Week Designation', 'Assigned Participants'
      ]
    },
    {
      name: 'Weekend Coverage',
      headers: [
        'Date', 'Day of Week', 'First Call Assignee', 'Vacation Adjacency Warning', 'Holiday Proximity Warning'
      ]
    },
    {
      name: 'Holiday Coverage',
      headers: [
        'Holiday Name', 'Observed Date', 'Call Position (Call 1 / Call 2)', 'Assigned Participant'
      ]
    },
    {
      name: 'Soft Holiday Warnings',
      headers: [
        'Event Name', 'Date', 'Enabled', 'Custom Description'
      ]
    },
    {
      name: 'Transfer Offers',
      headers: [
        'Offer ID', 'Original Assignee (Giver)', 'Assignment Type', 'Date/Position', 'Status', 'Timestamp', 'Group ID'
      ]
    },
    {
      name: 'Transfer History',
      headers: [
        'Timestamp', 'Assignment Type', 'Assignment Date', 'Call Position/Day',
        'Original Assignee', 'New Assignee', 'Year'
      ]
    },
    {
      name: 'Config',
      headers: ['Key', 'Value']
    },
    {
      name: 'Notification Log',
      headers: [
        'Log Timestamp', 'Event Key', 'Participant ID', 'Participant Name', 'Masked Phone',
        'Phase', 'Notification Type', 'Status', 'Entry Timestamp', 'Reminder Sent',
        'Admin Alert Sent', 'Resend WhatsApp', 'Selection Reference', 'Sanitized Error'
      ]
    }
  ];

  schemas.forEach(function(schema) {
    var sheet = ss.getSheetByName(schema.name);

    // Create sheet if missing
    if (!sheet) {
      sheet = ss.insertSheet(schema.name);
    }

    // Check headers and update if necessary
    var currentHeaders = [];
    if (sheet.getLastRow() > 0) {
      currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }

    // Ensure it has headers
    if (currentHeaders.length === 0 || currentHeaders[0] === '') {
      // sheet.getRange(1, 1, 1, schema.headers.length).setValues([schema.headers]);
sheet.appendRow(schema.headers);

      // Formatting
      var headerRange = sheet.getRange(1, 1, 1, schema.headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f3f3f3');
      sheet.setFrozenRows(1);

      // Populate default data if provided
      if (schema.defaultData && schema.defaultData.length > 0) {
        schema.defaultData.forEach(function(row) { sheet.appendRow(row); });
      }
    } else {
      // In-place migration for "Participant Config": Rename "Resend SMS" to "Resend WhatsApp"
      if (schema.name === 'Participant Config') {
        var resendIdx = currentHeaders.indexOf('Resend SMS');
        if (resendIdx !== -1) {
          sheet.getRange(1, resendIdx + 1).setValue('Resend WhatsApp');
          currentHeaders[resendIdx] = 'Resend WhatsApp';
        }
      }

      // In-place migration for "Admin Options": Append missing default rows
      if (schema.name === 'Admin Options' && schema.defaultData && schema.defaultData.length > 0) {
        var adminData = sheet.getDataRange().getValues();
        var existingKeys = {};
        for (var r = 1; r < adminData.length; r++) {
          if (adminData[r][0]) {
            existingKeys[adminData[r][0]] = true;
          }
        }
        var rowsToAppend = [];
        for (var d = 0; d < schema.defaultData.length; d++) {
          var key = schema.defaultData[d][0];
          if (!existingKeys[key]) {
            rowsToAppend.push(schema.defaultData[d]);
          }
        }
        if (rowsToAppend.length > 0) {
          var lastRowAdmin = sheet.getLastRow();
          rowsToAppend.forEach(function(r) { sheet.appendRow(r); });
        }
      }

      // Migrate missing columns for existing sheets
      var needsUpdate = false;
      for (var c = 0; c < schema.headers.length; c++) {
         if (currentHeaders.indexOf(schema.headers[c]) === -1) {
            sheet.getRange(1, currentHeaders.length + 1).setValue(schema.headers[c]);
            currentHeaders.push(schema.headers[c]);
            needsUpdate = true;
         }
      }
      if (needsUpdate) {
         var newHeaderRange = sheet.getRange(1, 1, 1, currentHeaders.length);
         newHeaderRange.setFontWeight('bold');
         newHeaderRange.setBackground('#f3f3f3');
      }
    }

    // Add visual warning for Admin Options
    if (schema.name === 'Admin Options' && schema.warning) {
      // Find row for warning
      var data = sheet.getDataRange().getValues();
      var hasWarning = false;
      for (var i = 0; i < data.length; i++) {
        if (data[i][0] === 'WARNING') {
          hasWarning = true;
          break;
        }
      }

      if (!hasWarning) {
        var lastRow = sheet.getLastRow();
        sheet.getRange(lastRow + 1, 1).setValue('WARNING');
        sheet.getRange(lastRow + 1, 2).setValue(schema.warning);
        sheet.getRange(lastRow + 1, 1, 1, 3).setFontColor('red').setFontWeight('bold');
      }
    }
  });

  sanitizeParticipantConfigSheet();
}

/**
 * Formats boolean columns as true Checkboxes and backfills missing default values.
 */
function sanitizeParticipantConfigSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Participant Config');
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return; // No participants populated

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();

  // Boolean Column configurations (Names and defaults)
  var booleanColsConfig = [
    { name: 'Active for Year', defaultVal: true },
    { name: 'Vacation Phase Enabled', defaultVal: true },
    { name: 'Weekend Phase Enabled', defaultVal: true },
    { name: 'Mandatory Holiday Eligible', defaultVal: true },
    { name: 'Transfer Giver', defaultVal: true },
    { name: 'Transfer Receiver', defaultVal: true },
    { name: 'Transfer Offers Submitted', defaultVal: false },
    { name: 'Had Spring Break Last Year', defaultVal: false },
    { name: 'Had Christmas Week Last Year', defaultVal: false },
    { name: 'Worked Any Official Holiday Last Year', defaultVal: false },
    { name: 'Resend WhatsApp', defaultVal: false }
  ];

  booleanColsConfig.forEach(function(item) {
    var colIndex = headers.indexOf(item.name);
    if (colIndex === -1) return; // Column not found

    // Convert to 1-based index
    var col = colIndex + 1;

    var range = sheet.getRange(2, col, lastRow - 1, 1);
    range.setDataValidation(checkboxRule); // Force Checkbox format

    var values = range.getValues();
    for (var r = 0; r < values.length; r++) {
      if (values[r][0] === '' || values[r][0] === null || values[r][0] === undefined) {
        values[r][0] = item.defaultVal;
      } else if (typeof values[r][0] === 'string') {
        values[r][0] = values[r][0].toUpperCase() === 'TRUE';
      }
    }
    range.setValues(values);
  });

  // Ensure Skipped Turns Remaining defaults to 0
  var skipsColIndex = headers.indexOf('Skipped Turns Remaining');
  if (skipsColIndex !== -1) {
    var skipsCol = skipsColIndex + 1;
    var skipsRange = sheet.getRange(2, skipsCol, lastRow - 1, 1);
    var skipsValues = skipsRange.getValues();
    for (var k = 0; k < skipsValues.length; k++) {
      if (skipsValues[k][0] === '' || skipsValues[k][0] === null || skipsValues[k][0] === undefined) {
        skipsValues[k][0] = 0;
      }
    }
    skipsRange.setValues(skipsValues);
  }
}
