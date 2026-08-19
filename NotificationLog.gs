/**
 * NotificationLog.gs - Unified logging for all WhatsApp notifications and resets
 */

/**
 * Appends a notification event to the Notification Log sheet.
 * @param {Object} logData - Event details
 */
function logNotificationEvent(logData) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName('Notification Log');
    if (!logSheet) return; // Silent fallback if schema isn't fully set up

    var timestamp = logData.timestamp || new Date();
    var eventKey = logData.eventKey || '';
    var pId = logData.participantId || '';
    var pName = logData.participantName || '';

    // Mask phone number
    var maskedPhone = '';
    if (logData.phone) {
      var rawPhone = String(logData.phone).replace(/[^\d]/g, '');
      if (rawPhone.length >= 4) {
        maskedPhone = "*******" + rawPhone.slice(-4);
      } else {
        maskedPhone = "****";
      }
    }

    var phase = logData.phase || '';
    var type = logData.type || '';
    var status = logData.status || '';
    var entryTime = logData.entryTimestamp || '';
    var reminderSent = logData.reminderSent !== undefined ? logData.reminderSent : '';
    var alertSent = logData.alertSent !== undefined ? logData.alertSent : '';
    var resendWhatsApp = logData.resendWhatsApp !== undefined ? logData.resendWhatsApp : '';
    var selectionRef = logData.selectionReference || '';
    var errorStr = logData.error || '';

    logSheet.appendRow([
      timestamp, eventKey, pId, pName, maskedPhone, phase, type, status,
      entryTime, reminderSent, alertSent, resendWhatsApp, selectionRef, errorStr
    ]);
  } catch (err) {
    console.error("[NotificationLog] Failed to append log row: " + err.message);
  }
}

/**
 * Atomically checks and reserves a confirmation event to prevent duplicates.
 * @param {string} eventKey - A stable identity for the event.
 * @param {Object} logData - Event details for the initial "PENDING" log.
 * @returns {boolean} True if successfully reserved (meaning it's new), false if it was already processed.
 */
function reserveConfirmationEvent(eventKey, logData) {
  if (!eventKey) return false;

  // This function must be called inside a script lock.

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('Notification Log');
  if (!logSheet) return true; // Can't verify, proceed optimistically

  var data = logSheet.getDataRange().getValues();
  var headers = data[0];
  var keyCol = headers.indexOf('Event Key');
  var statusCol = headers.indexOf('Status');

  if (keyCol !== -1 && statusCol !== -1) {
    for (var i = 1; i < data.length; i++) {
      if (data[i][keyCol] === eventKey) {
        var existingStatus = data[i][statusCol];
        if (existingStatus === 'PENDING' || existingStatus === 'SUCCESS' || existingStatus === 'FAILED') {
          return false; // Already processed or in progress
        }
      }
    }
  }

  // Not found, append PENDING
  logData.status = 'PENDING';
  logData.eventKey = eventKey;
  logNotificationEvent(logData);
  return true;
}

/**
 * Logs the current state of a participant's notification flags before they are reset.
 * @param {Object} participant - Participant data object containing Name and flag states
 * @param {string} phase - Current phase context
 */
function logStateReset(participant, phase) {
  logNotificationEvent({
    timestamp: new Date(),
    eventKey: 'RESET-' + new Date().getTime() + '-' + participant['Name'],
    participantId: participant['Name'],
    participantName: participant['Name'],
    phone: participant['Phone Number'],
    phase: phase,
    type: 'STATE_RESET',
    status: 'SUCCESS',
    entryTimestamp: participant['Entry Timestamp'],
    reminderSent: participant['Reminder Sent'],
    alertSent: participant['Admin Alert Sent'],
    resendWhatsApp: participant['Resend WhatsApp'] // Fallback to new name if mapped
  });
}
