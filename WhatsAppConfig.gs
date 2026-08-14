/**
 * WhatsAppConfig.gs - WAHA WhatsApp configuration module
 */

/**
 * Reads and validates WAHA configuration from Script Properties.
 *
 * @returns {Object} Normalized configuration object.
 * @throws {Error} If required configuration is missing or invalid.
 */
function getWhatsAppConfig_() {
  var props = PropertiesService.getScriptProperties();

  var baseUrl = props.getProperty('WAHA_BASE_URL') || '';
  baseUrl = baseUrl.trim();
  if (!baseUrl) {
    throw new Error("Missing WAHA_BASE_URL configuration");
  }
  // Remove trailing slashes
  baseUrl = baseUrl.replace(/\/+$/, '');

  if (baseUrl.indexOf('https://') !== 0) {
    throw new Error("WAHA_BASE_URL must be an HTTPS URL");
  }

  var apiKey = props.getProperty('WAHA_API_KEY') || '';
  apiKey = apiKey.trim();
  if (!apiKey) {
    throw new Error("Missing WAHA_API_KEY configuration");
  }

  var session = props.getProperty('WAHA_SESSION') || '';
  session = session.trim();
  if (!session) {
    session = 'default';
  }

  var adminPhone = props.getProperty('ADMIN_PHONE') || '';
  adminPhone = adminPhone.trim();
  if (!adminPhone) {
    throw new Error("Missing ADMIN_PHONE configuration");
  }

  // Note: we'll validate adminPhone when used, or we could do it here,
  // but it's typically validated through normalizeWhatsAppPhone_ later.

  var adminEmail = props.getProperty('ADMIN_EMAIL') || '';
  adminEmail = adminEmail.trim();
  if (!adminEmail || adminEmail.indexOf('@') === -1) {
    throw new Error("Missing or invalid ADMIN_EMAIL configuration");
  }

  var delayMsStr = props.getProperty('MESSAGE_DELAY_MS');
  var delayMs = 1500;
  if (delayMsStr !== null && delayMsStr.trim() !== '') {
    var parsedDelay = parseInt(delayMsStr, 10);
    if (!isNaN(parsedDelay) && parsedDelay >= 0) {
      delayMs = parsedDelay;
    }
  }

  var cooldownStr = props.getProperty('OUTAGE_ALERT_COOLDOWN_SECONDS');
  var cooldownSec = 1800;
  if (cooldownStr !== null && cooldownStr.trim() !== '') {
    var parsedCooldown = parseInt(cooldownStr, 10);
    if (!isNaN(parsedCooldown) && parsedCooldown >= 0 && parsedCooldown <= 21600) { // CacheService max is 21600
      cooldownSec = parsedCooldown;
    }
  }

  return {
    baseUrl: baseUrl,
    apiKey: apiKey,
    session: session,
    adminPhone: adminPhone,
    adminEmail: adminEmail,
    messageDelayMs: delayMs,
    outageAlertCooldownSeconds: cooldownSec
  };
}

/**
 * Builds the standard headers required for WAHA API requests.
 *
 * @param {Object} config The validated configuration object.
 * @returns {Object} Headers map.
 */
function buildWahaHeaders_(config) {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Api-Key': config.apiKey,
    'ngrok-skip-browser-warning': 'true'
  };
}
