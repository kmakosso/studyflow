import { db } from './db';

export const notif = {
  get supported() { return typeof window !== 'undefined' && 'Notification' in window; },
  get permission() { return this.supported ? Notification.permission : 'denied'; },

  async request() {
    if (!this.supported) return 'denied';
    return Notification.requestPermission();
  },

  show(title, body) {
    if (this.permission !== 'granted') return;
    try {
      new Notification(title, { body, icon: '/pwa-192x192.png' });
    } catch (_) {}
  },
};

/**
 * Start a background timer that checks pending reminders every minute.
 * Returns a cleanup function to stop the daemon.
 * Call once from Layout (always-mounted component).
 */
export function startReminderDaemon() {
  const check = async () => {
    if (notif.permission !== 'granted') return;
    const reminders = await db.all('reminders');
    const now = new Date();
    for (const r of reminders) {
      if (!r.triggered && new Date(r.datetime) <= now) {
        notif.show('⏰ Rappel StudyFlow', r.message);
        // Mark as triggered so it doesn't fire again
        await db.put('reminders', { ...r, triggered: true });
      }
    }
  };

  check(); // immediate check on mount
  const id = setInterval(check, 60_000);
  return () => clearInterval(id);
}
