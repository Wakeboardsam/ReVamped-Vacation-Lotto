/**
 * Notifications.gs - Automated Queue Notification Engine
 */

/**
 * Main routine to evaluate active participants and send necessary SMS notifications.
 * It will run on a time-driven trigger.
 */
function notifyActiveParticipants() {
  return withScriptLock(function() {
    var state = getQueueState();
    var phase = state.phase;

    // Stop notifications if lottery is complete or setup is pending
    if (phase === 'COMPLETE' || phase === 'SETUP_EMPTY') {
      return;
    }

    var activeParticipants = getActiveParticipants(phase);
    if (!activeParticipants || activeParticipants.length === 0) {
      return;
    }

    var adminOptions = getAdminOptions();
    var reminderDelayMins = parseInt(adminOptions['Reminder Delay (mins)']) || 360;
    var adminAlertDelayMins = parseInt(adminOptions['Admin Alert Delay (mins)']) || 720;
    var adminPhone = adminOptions['Admin Phone Number'];

    var pSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Participant Config');
    var pData = pSheet.getDataRange().getValues();
    var pHeaders = pData[0];

    var entryTimeCol = pHeaders.indexOf('Entry Timestamp') + 1;
    var reminderCol = pHeaders.indexOf('Reminder Sent') + 1;
    var alertCol = pHeaders.indexOf('Admin Alert Sent') + 1;
    var phoneCol = pHeaders.indexOf('Phone Number');

    var now = new Date();

    for (var i = 0; i < activeParticipants.length; i++) {
      var participant = activeParticipants[i];
      var rowIndex = participant._rowIndex;

      var entryTimeRaw = participant['Entry Timestamp'];
      var reminderSent = (participant['Reminder Sent'] === true || String(participant['Reminder Sent']).toUpperCase() === 'TRUE');
      var alertSent = (participant['Admin Alert Sent'] === true || String(participant['Admin Alert Sent']).toUpperCase() === 'TRUE');
      var participantPhone = participant['Phone Number'];
      var participantName = participant['Name'];

      if (!participantPhone) continue;

      // Stop condition: Admin alert already sent
      if (alertSent) {
        continue;
      }

      // 1. Immediate Entry SMS
      if (!entryTimeRaw) {
        var promptText = adminOptions['Prompt Text - ' + (phase.indexOf('VACATION') > -1 ? 'Vacation' : 'Weekend')] || 'It is your turn to pick.';

        sendSms(participantPhone, "Vacation Lottery: " + promptText + " Log in to make your selection.");

        // Update state
        pSheet.getRange(rowIndex, entryTimeCol).setValue(now);
        // Ensure flags are reset (e.g. if previous round wasn't cleared)
        pSheet.getRange(rowIndex, reminderCol).setValue(false);
        pSheet.getRange(rowIndex, alertCol).setValue(false);
        continue;
      }

      var entryTime = new Date(entryTimeRaw);
      var elapsedMins = (now.getTime() - entryTime.getTime()) / (1000 * 60);

      // 2. Admin Escalation Alert SMS
      if (elapsedMins > adminAlertDelayMins) {
        if (adminPhone) {
          sendSms(adminPhone, "Vacation Lottery Alert: " + participantName + " has been unresponsive for over " + adminAlertDelayMins + " minutes in phase " + phase + ".");
        }
        pSheet.getRange(rowIndex, alertCol).setValue(true);
        continue;
      }

      // 3. Participant Reminder SMS
      if (elapsedMins > reminderDelayMins && !reminderSent) {
        sendSms(participantPhone, "Vacation Lottery Reminder: It is still your turn to make a selection. Please log in as soon as possible.");
        pSheet.getRange(rowIndex, reminderCol).setValue(true);
      }
    }

    // We should also implement a cleanup to clear these flags for participants who are NO LONGER active.
    // However, the exact requirements say "Reset these flags when the participant completes their turn or when Queue.advanceQueue() runs."
    // We will do that in advanceQueue() to be safe.
  });
}
