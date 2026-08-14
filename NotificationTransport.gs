/**
 * NotificationTransport.gs - Provider-neutral boundary for sending notifications
 */

/**
 * Sends a notification to a participant using the configured transport (WhatsApp).
 *
 * @param {string|number} phone The participant's phone number.
 * @param {string} text The notification text to send.
 * @returns {Object} Normalized result object with { success, systemic, ... }
 */
function sendNotification_(phone, text) {
  // Check the global notification toggle.
  // Preserve legacy 'Enable SMS Notifications' name for backward compatibility.
  var options = getAdminOptions();
  var isEnabled = options['Enable SMS Notifications'];

  if (isEnabled === false || String(isEnabled).toUpperCase() === 'FALSE') {
    return {
      success: false,
      systemic: false,
      failureType: 'DISABLED',
      statusCode: null,
      providerCode: null,
      latencyMs: 0
    };
  }

  // Pass the request directly to the WAHA transport adapter.
  // It handles its own internal validations and normalized returns.
  return sendWhatsAppMessage(phone, text);
}
