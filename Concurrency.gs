/**
 * Concurrency.gs - LockService wrapper utilities and atomic transaction handlers
 */

/**
 * Executes a callback function atomically using LockService.
 * Enforces "First-Valid-Submission-Wins".
 *
 * @param {Function} callbackFn - The function to execute securely. It should throw an error if validation fails (e.g., slot already taken).
 * @param {number} [timeoutMs=10000] - Timeout in milliseconds.
 * @returns {*} The return value of the callback function.
 * @throws {Error} If lock cannot be acquired or callback throws.
 */
function withScriptLock(callbackFn, timeoutMs) {
  timeoutMs = timeoutMs || 10000;
  var lock = LockService.getScriptLock();

  try {
    // Wait for the lock
    lock.waitLock(timeoutMs);

    // Execute the critical section
    return callbackFn();

  } catch (e) {
    if (e.message.indexOf('Lock timeout') !== -1) {
      throw new Error("System is currently busy processing another request. Please try again.");
    }
    // Re-throw any business logic errors (e.g., "That position was just selected by another participant...")
    throw e;
  } finally {
    // Release the lock
    lock.releaseLock();
  }
}
