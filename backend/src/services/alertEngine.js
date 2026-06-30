import { createAlert, hasRecentAlert } from '../repositories/alerts.js';
import { publishAlert } from './alertBus.js';

/**
 * Emit an alert with simple de-duplication: drops the alert if an alert of the
 * same type+relation was created within the last `windowMin` minutes.
 */
export async function emitAlert({
  userId = null, type, severity = 'info', message,
  relatedEntity = null, relatedId = null, windowMin = 10,
}) {
  if (await hasRecentAlert({ type, relatedEntity, relatedId, windowMin })) {
    return null;
  }
  const alert = await createAlert({
    userId, type, severity, message, relatedEntity, relatedId,
  });
  publishAlert(alert);
  return alert;
}
