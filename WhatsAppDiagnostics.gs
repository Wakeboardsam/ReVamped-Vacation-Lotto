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
    reachable: false,
    statusCode: null,
    status: 'UNKNOWN',
    latencyMs: 0
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
    result.reachable = true;

    var body = response.getContentText();

    if (result.statusCode === 200) {
      if (body.toLowerCase().indexOf('<html') !== -1) {
        result.status = 'TUNNEL_OFFLINE';
      } else {
        try {
          var data = JSON.parse(body);
          if (data && data.status) {
            result.status = String(data.status).toUpperCase();
          } else {
            result.status = 'UNKNOWN_JSON_FORMAT';
          }
        } catch (e) {
          result.status = 'INVALID_JSON';
        }
      }
    } else if (result.statusCode === 401 || result.statusCode === 403) {
      result.status = 'AUTH_ERROR';
    } else if (result.statusCode === 404) {
      result.status = 'SESSION_NOT_FOUND';
    } else if (result.statusCode === 502 || result.statusCode === 504) {
      result.status = 'TUNNEL_OFFLINE';
    } else {
      result.status = 'ERROR_' + result.statusCode;
    }
  } catch (err) {
    result.latencyMs = new Date().getTime() - startTime;
    result.reachable = false;
    result.status = 'NETWORK_ERROR';
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
    console.log("[INFO] WAHA health check completed: session=" + config.session + " status=" + health.status + " latencyMs=" + health.latencyMs);

    if (health.status !== 'WORKING') {
      console.warn("[WARN] Diagnostic test skipping send because session status is not WORKING. Current status: " + health.status);
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
