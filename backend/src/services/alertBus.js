import { EventEmitter } from 'node:events';

// In-process pub/sub used by SSE endpoint subscribers.
class AlertBus extends EventEmitter {}
export const alertBus = new AlertBus();
alertBus.setMaxListeners(100);

export function publishAlert(alert) {
  alertBus.emit('alert', alert);
}
