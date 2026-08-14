/**
 * WhatsAppAlerts.gs - Handles system outages for the WAHA integration
 */

/**
 * Handles systemic WAHA outages by sending a rate-limited email to the administrator.
 *
 * @param {string} failureType The normalized failure type (e.g., 'TUNNEL_OFFLINE', 'AUTH_ERROR')
 * @param {Object} safeContext Safe context about the failure (e.g., statusCode, providerCode)
 */
function handleSystemOutage(failureType, safeContext) {
  try {
    var config = getWhatsAppConfig_();
    var adminEmail = config.adminEmail;
    var cooldownSec = config.outageAlertCooldownSeconds;
    var sessionName = config.session;

    if (!adminEmail) {
      return;
    }

    var lock = LockService.getScriptLock();
    // Wait up to 10 seconds for the lock
    if (!lock.tryLock(10000)) {
      console.warn("[WARN] Could not acquire lock for handleSystemOutage");
      return;
    }

    try {
      var cache = CacheService.getScriptCache();
      var cacheKey = 'waha_outage_' + failureType;
      var lastSent = cache.get(cacheKey);

      if (lastSent) {
        // Cooldown active, skip email
        return;
      }

      var subject = "Vacation Lottery System Alert: WhatsApp Integration Outage";
      var body = "The Vacation Lottery system encountered a systemic failure with the WhatsApp notification integration.\n\n" +
                 "Failure Type: " + failureType + "\n" +
                 "Session Name: " + sessionName + "\n\n";

      if (safeContext) {
        if (safeContext.statusCode) {
          body += "Status Code: " + safeContext.statusCode + "\n";
        }
        if (safeContext.providerCode) {
          body += "Provider Code: " + safeContext.providerCode + "\n";
        }
      }

      body += "\nPlease check the WAHA container, network tunnel, and configuration.\n\n" +
              "This alert is rate-limited and will not be repeated for this failure type for " + (cooldownSec / 60) + " minutes.";

      MailApp.sendEmail({
        to: adminEmail,
        subject: subject,
        body: body
      });

      console.log("[INFO] System outage email sent for " + failureType);

      // Only set cache after email successfully sent
      if (cooldownSec > 0) {
        cache.put(cacheKey, new Date().getTime().toString(), cooldownSec);
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    // Never throw from the outage handler back to the caller
    console.error("[ERROR] Failed to send outage alert email: " + err.message);
  }
}
