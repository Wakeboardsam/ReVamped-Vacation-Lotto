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

  // 1. Input Validation
  try {
    if (messageText === null || messageText === undefined) {
      throw new Error("Message text is required");
    }

    textStr = String(messageText).trim();
    if (textStr === '') {
      throw new Error("Message text cannot be blank");
    }

    phoneObj = normalizeWhatsAppPhone_(rawPhoneNumber);
  } catch (err) {
    result.latencyMs = new Date().getTime() - startTime;
    result.systemic = false;
    result.failureType = 'VALIDATION_ERROR';
    // Do not leak raw exceptions or full phone numbers in providerCode if not needed, but safe validation errors are ok.
    result.providerCode = err.message;
    console.warn("[WARN] WhatsApp validation failed: " + err.message);
    return result;
  }

  // 2. Config Validation
  try {
    config = getWhatsAppConfig_();
  } catch (err) {
    result.latencyMs = new Date().getTime() - startTime;
    result.systemic = true;
    result.failureType = 'CONFIG_ERROR';
    result.providerCode = err.message;
    console.error("[ERROR] WhatsApp configuration error: " + err.message);
    handleSystemOutage(result.failureType, { providerCode: err.message });
    return result;
  }

  // 3. Network Request
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
    var parsedBody = null;
    try {
      parsedBody = JSON.parse(body);
    } catch (e) {}

    var strBody = body.toUpperCase();
    var isSessionOfflineBody = (
      strBody.indexOf('DOES NOT EXIST') !== -1 ||
      strBody.indexOf('STOPPED') !== -1 ||
      strBody.indexOf('SCAN_QR_CODE') !== -1 ||
      strBody.indexOf('SESSION NOT FOUND') !== -1 ||
      strBody.indexOf('FAILED') !== -1
    );
    var isRateLimitBody = (strBody.indexOf('463') !== -1);

    if (result.statusCode === 502 || result.statusCode === 504 || ngrokError || body.toLowerCase().indexOf('<html') !== -1) {
      result.systemic = true;
      result.failureType = 'TUNNEL_OFFLINE';
    }
    else if (result.statusCode === 401 || result.statusCode === 403) {
      result.systemic = true;
      result.failureType = 'AUTH_ERROR';
    }
    else if (result.statusCode === 429 || result.statusCode === 463 || isRateLimitBody) {
      result.systemic = true;
      result.failureType = 'RATE_LIMIT';
    }
    else if (result.statusCode >= 500) {
      result.systemic = true;
      result.failureType = 'WAHA_ERROR';
    }
    else if ((result.statusCode === 200 || result.statusCode === 201) && parsedBody) {
      result.success = true;
      console.log("[INFO] WhatsApp send accepted: recipient=*******" + phoneObj.digits.slice(-4) + " statusCode=" + result.statusCode);
      return result;
    }
    else {
      if (isSessionOfflineBody) {
        result.systemic = true;
        result.failureType = 'SESSION_OFFLINE';
      } else if (result.statusCode === 400 || result.statusCode === 404 || result.statusCode === 422) {
        // Use REQUEST_ERROR for generic 400/404/422 unless the response clearly identifies a recipient problem.
        // If parsedBody exists and has a message that suggests recipient issue, we can override to RECIPIENT_REJECTED,
        // but default to REQUEST_ERROR.
        result.systemic = false;
        result.failureType = 'REQUEST_ERROR';
      } else {
        result.systemic = false;
        result.failureType = 'REQUEST_ERROR';
      }

      if (parsedBody && parsedBody.message) {
        result.providerCode = String(parsedBody.message).substring(0, 100);
        var msgUpper = result.providerCode.toUpperCase();
        if (msgUpper.indexOf('INVALID') !== -1 || msgUpper.indexOf('NUMBER') !== -1 || msgUpper.indexOf('RECIPIENT') !== -1) {
           result.failureType = 'RECIPIENT_REJECTED';
        }
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
    result.failureType = 'NETWORK_ERROR';
    // Do not log raw exception message fully as it might leak the endpoint url or other sensitive details
    console.error("[ERROR] WAHA systemic network error: type=" + result.failureType);
    handleSystemOutage(result.failureType, { providerCode: 'UrlFetchApp error' });
    return result;
  }
}
