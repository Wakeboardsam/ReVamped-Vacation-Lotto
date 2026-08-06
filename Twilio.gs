/**
 * Twilio.gs - Twilio SMS Integration
 */

/**
 * Formats a phone number to standard E.164 format.
 * Assumes US/Canada numbers for simplicity if country code is missing.
 * @param {string} phoneNumber
 * @returns {string} E.164 formatted number or original if unable to parse reliably
 */
function formatE164(phoneNumber) {
  if (!phoneNumber) return '';
  var cleaned = String(phoneNumber).replace(/\D/g, '');
  if (cleaned.length === 10) {
    return '+1' + cleaned;
  } else if (cleaned.length === 11 && cleaned.charAt(0) === '1') {
    return '+' + cleaned;
  }
  // Fallback to original string prefixed with + if it looks like an international number
  if (cleaned.length > 11) {
      return '+' + cleaned;
  }
  return phoneNumber; // Return original if it doesn't match standard lengths
}

/**
 * Sends an SMS message using Twilio REST API.
 * Reads credentials dynamically from 'Admin Options' sheet.
 * @param {string} toPhoneNumber - The destination phone number.
 * @param {string} messageBody - The message content.
 */
function sendSms(toPhoneNumber, messageBody) {
  var adminOptions = getAdminOptions();

  var enableSms = adminOptions['Enable SMS Notifications'] === true || String(adminOptions['Enable SMS Notifications']).toUpperCase() === 'TRUE';
  if (!enableSms) {
    console.log("SMS Notifications are disabled in Admin Options. Message not sent to " + toPhoneNumber);
    return;
  }

  var accountSid = adminOptions['Twilio Account SID'];
  var authToken = adminOptions['Twilio Auth Token'];
  var senderPhone = adminOptions['Twilio Sender Phone'];

  if (!accountSid || !authToken || !senderPhone) {
    console.log("Twilio credentials missing in Admin Options. Message not sent to " + toPhoneNumber);
    return;
  }

  var formattedToNumber = formatE164(toPhoneNumber);
  if (!formattedToNumber) {
    console.log("Invalid destination phone number. Message not sent.");
    return;
  }

  var formattedSenderPhone = formatE164(senderPhone);

  if (!formattedToNumber.startsWith('whatsapp:')) {
    formattedToNumber = 'whatsapp:' + formattedToNumber;
  }
  if (!formattedSenderPhone.startsWith('whatsapp:')) {
    formattedSenderPhone = 'whatsapp:' + formattedSenderPhone;
  }

  var url = 'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json';

  var payload = {
    'To': formattedToNumber,
    'From': formattedSenderPhone,
    'Body': messageBody
  };

  var options = {
    'method': 'post',
    'payload': payload,
    'muteHttpExceptions': true, // Prevent throwing exceptions to mask token in logs
    'headers': {
      'Authorization': 'Basic ' + Utilities.base64Encode(accountSid + ':' + authToken)
    }
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var responseBody = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      console.log("SMS sent successfully to " + formattedToNumber);
    } else {
      // Avoid logging AuthToken, log general error
      console.error("Twilio API Error (" + responseCode + "): Failed to send SMS to " + formattedToNumber);
      // Carefully parse to avoid exposing sensitive info if Twilio responds with it
      try {
        var parsedError = JSON.parse(responseBody);
        console.error("Twilio Error Details: " + parsedError.message);
      } catch (e) {
        console.error("Failed to parse Twilio error response.");
      }
    }
  } catch (error) {
    console.error("Network or internal error when attempting to send SMS to " + formattedToNumber + ": " + error.message);
  }
}

/**
 * Tests the Twilio direct integration via WhatsApp.
 */
function testTwilioDirect() {
  var adminOptions = getAdminOptions();
  var adminPhone = adminOptions['Admin Phone Number']; // Ensure correct key is used from your Google Sheet Admin Options tab

  if (!adminPhone) {
    console.log("Admin Phone Number is missing in Admin Options. Using a fallback number if possible, or failing.");
    // Optional fallback: adminPhone = '+1234567890';
  }

  console.log("Executing testTwilioDirect...");
  console.log("Attempting to send test WhatsApp message to: " + adminPhone);

  sendSms(adminPhone, "Hello from Vacation Lotto WhatsApp Test!");

  console.log("testTwilioDirect execution completed.");
}
