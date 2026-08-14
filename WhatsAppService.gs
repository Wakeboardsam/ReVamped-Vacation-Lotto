/**
 * WhatsAppService.gs - WAHA WhatsApp core sender module
 */

/**
 * Normalizes a raw phone number into the format required by WAHA.
 *
 * @param {string|number} rawPhoneNumber
 * @returns {Object} Object containing digits and the WAHA chatId
 * @throws {Error} If the phone number is invalid
 */
function normalizeWhatsAppPhone_(rawPhoneNumber) {
  if (rawPhoneNumber === null || rawPhoneNumber === undefined) {
    throw new Error("Phone number is required");
  }

  if (typeof rawPhoneNumber === 'object') {
    throw new Error("Phone number cannot be an object");
  }

  var str = String(rawPhoneNumber).trim();
  if (str === '') {
    throw new Error("Phone number cannot be blank");
  }

  // Remove ordinary display punctuation and nondigit characters
  var digits = str.replace(/[^\d]/g, '');

  if (digits.length === 10) {
    digits = '1' + digits;
  } else if (digits.length >= 11 && digits.length <= 15) {
    var firstDigit = digits.charAt(0);
    if (firstDigit < '1' || firstDigit > '9') {
      throw new Error("11-15 digit phone numbers must begin with 1-9");
    }
  } else {
    throw new Error("Invalid phone number length");
  }

  // Only check for all zeros on the remaining digits after prefix (or the whole thing if it wasn't prefixed)
  // Actually, any number that is purely '0' or purely '100...' should be rejected, but the spec says "reject all-zero values".
  if (/^1?0+$/.test(digits)) {
    throw new Error("Phone number cannot be all zeros");
  }

  return {
    digits: digits,
    chatId: digits + '@c.us'
  };
}

/**
 * Sends a WhatsApp message via WAHA.
 *
 * @param {string|number} rawPhoneNumber The recipient's phone number.
 * @param {string} messageText The message text to send.
 * @returns {Object} Normalized result object.
 */
function sendWhatsAppMessage(rawPhoneNumber, messageText) {
  var startTime = new Date().getTime();

  var result = {
    success: false,
    systemic: false,
    statusCode: null,
    failureType: null,
    providerCode: null,
    latencyMs: 0
  };

  var config, phoneObj, textStr;

  try {
    if (messageText === null || messageText === undefined) {
      throw new Error("Message text is required");
    }

    textStr = String(messageText).trim();
    if (textStr === '') {
      throw new Error("Message text cannot be blank");
    }

    phoneObj = normalizeWhatsAppPhone_(rawPhoneNumber);
    config = getWhatsAppConfig_();
  } catch (err) {
    result.latencyMs = new Date().getTime() - startTime;
    result.systemic = false;
    result.failureType = 'VALIDATION_ERROR';
    result.providerCode = err.message;
    console.warn("[WARN] WhatsApp validation failed: " + err.message);
    return result;
  }

  try {
    var payload = {
      chatId: phoneObj.chatId,
      text: textStr,
      session: config.session
    };

    var options = {
      method: 'post',
      headers: buildWahaHeaders_(config),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var endpoint = config.baseUrl + '/api/sendText';
    var response = UrlFetchApp.fetch(endpoint, options);

    result.latencyMs = new Date().getTime() - startTime;
    result.statusCode = response.getResponseCode();

    var headers = response.getAllHeaders();
    var ngrokError = null;
    for (var key in headers) {
      if (key.toLowerCase() === 'ngrok-error-code') {
        ngrokError = headers[key];
        break;
      }
    }

    if (ngrokError) {
      result.providerCode = ngrokError;
    }

    var body = response.getContentText();

    if (result.statusCode === 502 || result.statusCode === 504 || ngrokError || body.toLowerCase().indexOf('<html') !== -1) {
      result.systemic = true;
      result.failureType = 'TUNNEL_OFFLINE';
    }
    else if (result.statusCode === 401 || result.statusCode === 403) {
      result.systemic = true;
      result.failureType = 'AUTH_ERROR';
    }
    else if (result.statusCode === 429) {
      result.systemic = true;
      result.failureType = 'RATE_LIMIT';
    }
    else if (result.statusCode >= 200 && result.statusCode < 300) {
      result.success = true;
      console.log("[INFO] WhatsApp send accepted: recipient=*******" + phoneObj.digits.slice(-4) + " statusCode=" + result.statusCode);
      return result;
    }
    else {
      var parsedBody = null;
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {}

      var isSessionOffline = false;
      var strBody = body.toUpperCase();
      if (strBody.indexOf('STOPPED') !== -1 || strBody.indexOf('SCAN_QR_CODE') !== -1 || strBody.indexOf('SESSION NOT FOUND') !== -1) {
        isSessionOffline = true;
      }

      if (isSessionOffline) {
        result.systemic = true;
        result.failureType = 'SESSION_OFFLINE';
      } else {
        result.systemic = false;
        result.failureType = 'RECIPIENT_REJECTED';
      }

      if (parsedBody && parsedBody.message) {
        result.providerCode = String(parsedBody.message).substring(0, 100);
      }
    }

    if (result.systemic) {
      console.error("[ERROR] WAHA systemic failure: type=" + result.failureType + " statusCode=" + result.statusCode + (result.providerCode ? " providerCode=" + result.providerCode : ""));
      handleSystemOutage(result.failureType, {
        statusCode: result.statusCode,
        providerCode: result.providerCode
      });
    } else {
      console.warn("[WARN] WhatsApp recipient rejected: recipient=*******" + phoneObj.digits.slice(-4) + " statusCode=" + result.statusCode + (result.providerCode ? " providerCode=" + result.providerCode : ""));
    }

    return result;

  } catch (err) {
    result.latencyMs = new Date().getTime() - startTime;
    result.systemic = true;
    result.failureType = 'TUNNEL_OFFLINE';
    result.providerCode = err.message;
    console.error("[ERROR] WAHA systemic network error: type=" + result.failureType + " error=" + err.message);
    handleSystemOutage(result.failureType, { providerCode: err.message });
    return result;
  }
}
