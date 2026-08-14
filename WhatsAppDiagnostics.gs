/**
 * WhatsAppDiagnostics.gs - Manual diagnostics and health checks
 */

/**
 * Checks the health of the WAHA connection.
 *
 * @returns {Object} Normalized health check result.
 */
function checkWahaHealth() {
  var startTime = new Date().getTime();

  var result = {
    success: false,
    tunnelOnline: false,
    apiReachable: false,
    authenticated: false,
    sessionStatus: 'UNKNOWN',
    latencyMs: 0,
    statusCode: null,
    failureType: null,
    checkedAt: new Date().toISOString()
  };

  try {
    var config = getWhatsAppConfig_();

    var endpoint = config.baseUrl + '/api/sessions/' + encodeURIComponent(config.session);
    var options = {
      method: 'get',
      headers: buildWahaHeaders_(config),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(endpoint, options);
    result.latencyMs = new Date().getTime() - startTime;
    result.statusCode = response.getResponseCode();

    var body = response.getContentText();

    if (result.statusCode === 502 || result.statusCode === 504 || body.toLowerCase().indexOf('<html') !== -1) {
      result.tunnelOnline = false;
      result.apiReachable = false;
      result.failureType = 'TUNNEL_OFFLINE';
    } else {
      result.tunnelOnline = true;
      result.apiReachable = true;

      if (result.statusCode === 401 || result.statusCode === 403) {
        result.authenticated = false;
        result.failureType = 'AUTH_ERROR';
      } else {
        result.authenticated = true;

        if (result.statusCode === 200 || result.statusCode === 201) {
          try {
            var data = JSON.parse(body);
            if (data && data.status) {
              result.sessionStatus = String(data.status).toUpperCase();
            } else {
              result.sessionStatus = 'UNKNOWN_JSON_FORMAT';
            }
          } catch (e) {
            result.sessionStatus = 'INVALID_JSON';
            result.failureType = 'PARSE_ERROR';
          }

          if (result.sessionStatus === 'WORKING') {
            result.success = true;
          } else {
            result.failureType = 'SESSION_OFFLINE';
          }
        } else if (result.statusCode === 404) {
          result.sessionStatus = 'SESSION_NOT_FOUND';
          result.failureType = 'SESSION_OFFLINE';
        } else {
          result.sessionStatus = 'ERROR_' + result.statusCode;
          result.failureType = 'WAHA_ERROR';
        }
      }
    }
  } catch (err) {
    result.latencyMs = new Date().getTime() - startTime;
    result.tunnelOnline = false;
    result.apiReachable = false;
    result.failureType = 'NETWORK_ERROR';
  }

  return result;
}

/**
 * Manually executed live diagnostic tool. Must only be run by the administrator.
 * Do not run in automated testing environments.
 */
function runWhatsAppDiagnostics() {
  var report = {
    success: false,
    configValid: false,
    health: null,
    testSendAttempted: false,
    testSend: null,
    startedAt: new Date().toISOString(),
    completedAt: null
  };

  try {
    var config = getWhatsAppConfig_();
    report.configValid = true;
    console.log("[INFO] Configuration loaded successfully.");

    var health = checkWahaHealth();
    report.health = health;
    console.log("[INFO] WAHA health check completed: session=" + config.session + " sessionStatus=" + health.sessionStatus + " latencyMs=" + health.latencyMs);

    if (health.sessionStatus !== 'WORKING') {
      console.warn("[WARN] Diagnostic test skipping send because sessionStatus is not WORKING. Current sessionStatus: " + health.sessionStatus);
      report.completedAt = new Date().toISOString();
      return report;
    }

    report.testSendAttempted = true;
    var message = "Vacation Lottery WhatsApp diagnostic succeeded at " + new Date().toISOString() + ". No action is required.";

    var sendResult = sendWhatsAppMessage(config.adminPhone, message);
    report.testSend = sendResult;

    if (sendResult.success) {
      report.success = true;
      console.log("[INFO] Diagnostic test message sent successfully.");
    } else {
      console.error("[ERROR] Diagnostic test send failed: type=" + sendResult.failureType + " code=" + sendResult.statusCode);
    }

  } catch (err) {
    console.error("[ERROR] Diagnostic runner encountered a fatal error: " + err.message);
  }

  report.completedAt = new Date().toISOString();
  return report;
}
