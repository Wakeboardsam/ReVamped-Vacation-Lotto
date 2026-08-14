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
    var props = PropertiesService.getScriptProperties();
    var adminEmail = props.getProperty('ADMIN_EMAIL') || '';
    adminEmail = adminEmail.trim();

    if (!adminEmail || adminEmail.indexOf('@') === -1) {
      return;
    }

    var sessionName = props.getProperty('WAHA_SESSION') || 'default';
    sessionName = sessionName.trim() || 'default';

    var cooldownStr = props.getProperty('OUTAGE_ALERT_COOLDOWN_SECONDS');
    var cooldownSec = 1800;
    if (cooldownStr !== null && cooldownStr.trim() !== '') {
      var parsedCooldown = parseInt(cooldownStr, 10);
      if (!isNaN(parsedCooldown) && parsedCooldown >= 0 && parsedCooldown <= 21600) {
        cooldownSec = parsedCooldown;
      }
    }

    var lock = LockService.getScriptLock();
    var weAcquiredLock = false;

    // Only lock if not already held by the caller
    if (!lock.hasLock()) {
      // Wait up to 10 seconds for the lock
      if (!lock.tryLock(10000)) {
        console.warn("[WARN] Could not acquire lock for handleSystemOutage");
        return;
      }
      weAcquiredLock = true;
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
      if (weAcquiredLock) {
        lock.releaseLock();
      }
    }
  } catch (err) {
    // Never throw from the outage handler back to the caller
    console.error("[ERROR] Failed to send outage alert email: " + err.message);
  }
}
