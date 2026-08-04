// Lets NotificationsCenter tell Layout's header badge to re-fetch its unread
// count immediately after a mark-read action, instead of waiting for the
// next 30s poll tick (which left the badge showing a stale count).
const EVENT = "notifications:changed";

export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function onNotificationsChanged(handler: () => void) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
