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
  // Pass the request directly to the WAHA transport adapter.
  // It handles its own internal validations and normalized returns.
  return sendWhatsAppMessage(phone, text);
}
