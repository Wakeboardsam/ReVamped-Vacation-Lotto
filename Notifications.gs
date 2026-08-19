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

    var isEnabled = adminOptions['Enable SMS Notifications'];
    // Fast exit if globally disabled or not explicitly TRUE
    if (isEnabled !== true && String(isEnabled).toUpperCase() !== 'TRUE') {
      return;
    }

    var config = null;
    try {
      config = getWhatsAppConfig_();
    } catch(e) {
      handleSystemOutage('CONFIG_ERROR', { providerCode: 'Invalid WAHA configuration' });
      return;
    }

    var reminderDelayMins = parseInt(adminOptions['Reminder Delay (mins)']) || 360;
    var adminAlertDelayMins = parseInt(adminOptions['Admin Alert Delay (mins)']) || 720;
    var adminPhone = config.adminPhone;

    var pSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Participant Config');
    var pData = pSheet.getDataRange().getValues();
    var pHeaders = pData[0];

    var entryTimeCol = pHeaders.indexOf('Entry Timestamp') + 1;
    var reminderCol = pHeaders.indexOf('Reminder Sent') + 1;
    var alertCol = pHeaders.indexOf('Admin Alert Sent') + 1;
    var phoneCol = pHeaders.indexOf('Phone Number');

    var now = new Date();
    var delayMs = config.messageDelayMs || 1500;
    var attemptsMade = 0;

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

      var notificationPhone = null;
      var notificationText = null;

      // 1. Immediate Entry Notification
      if (!entryTimeRaw) {
        var promptKey = 'Prompt Text - Vacation';
        if (phase === 'WEEKEND') promptKey = 'Prompt Text - Weekend';
        else if (phase.indexOf('HOLIDAY') > -1) promptKey = 'Prompt Text - Holiday';
        else if (phase.indexOf('TRANSFER') > -1) promptKey = 'Prompt Text - Transfer';

        var promptText = adminOptions[promptKey] || 'It is your turn to pick.';
        notificationPhone = participantPhone;
        notificationText = "Vacation Lottery: " + promptText;

        var webAppUrl = adminOptions['Web App URL'];
        if (webAppUrl) {
          notificationText += "\nOpen the lottery: " + webAppUrl;
        } else {
          notificationText += " Log in to make your selection.";
        }

        // Update state BEFORE sending
        pSheet.getRange(rowIndex, entryTimeCol).setValue(now);
        pSheet.getRange(rowIndex, reminderCol).setValue(false);
        pSheet.getRange(rowIndex, alertCol).setValue(false);

      } else {
        var entryTime = new Date(entryTimeRaw);
        var elapsedMins = (now.getTime() - entryTime.getTime()) / (1000 * 60);

        // 2. Admin Escalation Alert Notification
        if (elapsedMins > adminAlertDelayMins) {
          if (adminPhone) {
            notificationPhone = adminPhone;
            notificationText = "Vacation Lottery Alert: " + participantName + " has been unresponsive for over " + adminAlertDelayMins + " minutes in phase " + phase + ".";
          }
          // Update state BEFORE sending
          pSheet.getRange(rowIndex, alertCol).setValue(true);
        }
        // 3. Participant Reminder Notification
        else if (elapsedMins > reminderDelayMins && !reminderSent) {
          var promptKey = 'Prompt Text - Vacation';
          if (phase === 'WEEKEND') promptKey = 'Prompt Text - Weekend';
          else if (phase.indexOf('HOLIDAY') > -1) promptKey = 'Prompt Text - Holiday';
          else if (phase.indexOf('TRANSFER') > -1) promptKey = 'Prompt Text - Transfer';

          var promptText = adminOptions[promptKey] || 'It is your turn to pick.';

          notificationPhone = participantPhone;
          notificationText = "Vacation Lottery Reminder: " + promptText;

          var webAppUrl = adminOptions['Web App URL'];
          if (webAppUrl) {
            notificationText += "\nOpen the lottery: " + webAppUrl;
          } else {
            notificationText += " Please log in as soon as possible.";
          }

          // Update state BEFORE sending
          pSheet.getRange(rowIndex, reminderCol).setValue(true);
        }
      }

      // If we have a notification to send in this iteration
      if (notificationPhone && notificationText) {
        SpreadsheetApp.flush(); // Persist the sheet changes before the HTTP call

        if (attemptsMade > 0) {
          Utilities.sleep(delayMs);
        }
        attemptsMade++;

        var result = sendParticipantNotification_(notificationPhone, notificationText);

        // Log the result
        var notifType = !entryTimeRaw ? 'INITIAL' : (notificationPhone === adminPhone ? 'ADMIN_ALERT' : 'REMINDER');
        if (typeof logNotificationEvent !== 'undefined') {
          logNotificationEvent({
            timestamp: new Date(),
            eventKey: 'AUTO-' + notifType + '-' + new Date().getTime() + '-' + participantName,
            participantId: participantName,
            participantName: participantName,
            phone: notificationPhone, // Admin phone if admin alert
            phase: phase,
            type: notifType,
            status: result.success ? 'SUCCESS' : 'FAILED',
            entryTimestamp: !entryTimeRaw ? now : entryTimeRaw,
            reminderSent: pSheet.getRange(rowIndex, reminderCol).getValue(),
            alertSent: pSheet.getRange(rowIndex, alertCol).getValue(),
            resendWhatsApp: '', // Not applicable here
            error: result.failureType ? result.failureType : (result.error ? 'TRANSPORT_ERROR' : '')
          });
        }

        if (result && result.systemic === true) {
          // Abort further processing in this trigger run on systemic failure
          console.warn("[WARN] Aborting notification loop due to systemic failure.");
          break;
        }
      }
    }

    // We should also implement a cleanup to clear these flags for participants who are NO LONGER active.
    // However, the exact requirements say "Reset these flags when the participant completes their turn or when Queue.advanceQueue() runs."
    // We will do that in advanceQueue() to be safe.
  });
}
