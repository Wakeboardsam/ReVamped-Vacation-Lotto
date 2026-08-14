/**
 * WhatsAppBatch.gs - Optional batch sending utility
 */

/**
 * Sends a batch of WAHA messages sequentially, sleeping between attempts, and aborting on systemic failure.
 *
 * @param {Array<Object>} items Array of items with { phone: string, text: string }
 * @returns {Object} Batch result report
 */
function sendWhatsAppBatch(items) {
  var report = {
    total: items ? items.length : 0,
    sent: 0,
    failed: 0,
    success: false,
    aborted: false,
    results: []
  };

  if (!items || items.length === 0) {
    report.success = true;
    return report;
  }

  var config;
  try {
    config = getWhatsAppConfig_();
  } catch (e) {
    report.aborted = true;
    report.failed = report.total;
    return report;
  }

  var delayMs = config.messageDelayMs || 1500;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var sendResult = sendWhatsAppMessage(item.phone, item.text);

    report.results.push({
      index: i,
      result: sendResult
    });

    if (sendResult.success) {
      report.sent++;
    }

    if (sendResult.systemic) {
      report.aborted = true;
      break;
    }

    if (i < items.length - 1) {
      Utilities.sleep(delayMs);
    }
  }

  report.failed = report.total - report.sent;
  report.success = (report.sent === report.total);

  return report;
}
