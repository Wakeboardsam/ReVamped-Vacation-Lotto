/**
 * WhatsAppBatch.gs - Optional batch sending utility
 */

/**
 * Sends a batch of WAHA messages sequentially, sleeping between attempts, and aborting on systemic failure.
 *
 * @param {Array<Object>} items Array of items with { phone: string, message: string } (optional text compatibility field)
 * @returns {Object} Batch result report
 */
function sendWhatsAppBatch(items) {
  var report = {
    total: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    success: false,
    aborted: 0,
    abortedBecause: null,
    errors: []
  };

  if (!items || !Array.isArray(items)) {
    report.success = false;
    report.abortedBecause = 'VALIDATION_ERROR';
    report.errors.push({ index: null, error: 'Input must be an array' });
    return report;
  }

  if (items.length === 0) {
    report.success = true;
    return report;
  }

  report.total = items.length;

  var config;
  try {
    config = getWhatsAppConfig_();
  } catch (e) {
    report.aborted = report.total;
    report.failed = report.total;
    report.abortedBecause = 'CONFIG_ERROR';
    report.errors.push({ index: null, error: e.message });
    return report;
  }

  var delayMs = config.messageDelayMs || 1500;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    report.attempted++;
    var textObj = item.message || item.text;
    var sendResult = sendWhatsAppMessage(item.phone, textObj);

    if (sendResult.success) {
      report.sent++;
    } else {
      report.failed++;
      report.errors.push({
        index: i,
        error: sendResult.failureType + (sendResult.providerCode ? ': ' + sendResult.providerCode : '')
      });
    }

    if (sendResult.systemic) {
      report.abortedBecause = sendResult.failureType;
      break;
    }

    if (i < items.length - 1 && !sendResult.systemic) {
      Utilities.sleep(delayMs);
    }
  }

  report.aborted = report.total - report.attempted;
  report.failed = report.total - report.sent;
  report.success = (report.sent === report.total);

  return report;
}
