import { db } from './db';

/* ── notifications.js — Notifications navigateur + planifiées ─────────
 *
 * Trois niveaux, du plus capable au repli :
 *   1. Notification Triggers API (Chrome/Edge/Android) → la notif est
 *      programmée à l'heure exacte et se déclenche MÊME APP FERMÉE,
 *      sans serveur (registration.showNotification + TimestampTrigger).
 *   2. Service Worker showNotification() → notif système (barre de
 *      notifications), marche sur PWA installée.
 *   3. new Notification() → repli navigateur classique (onglet ouvert).
 */

const ICON = '/pwa-192x192.png';
const TAG  = (id) => `rem-${id}`;

/* Triggers API disponible ? (programmation hors-ligne) */
function triggersSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && typeof window.TimestampTrigger !== 'undefined'
    && 'showTrigger' in Notification.prototype;
}

async function swReg() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.ready; } catch { return null; }
}

/* ── Affichage immédiat (Pomodoro, rappels en avant-plan) ──────────── */
async function showNow(title, body, data = {}) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const reg = await swReg();
  if (reg?.showNotification) {
    try {
      await reg.showNotification(title, { body, icon: ICON, badge: ICON, data });
      return;
    } catch { /* fall through */ }
  }
  try { new Notification(title, { body, icon: ICON }); } catch { /* noop */ }
}

export const notif = {
  get supported() { return typeof window !== 'undefined' && 'Notification' in window; },
  get permission() { return this.supported ? Notification.permission : 'denied'; },
  get triggers()  { return triggersSupported(); },

  async request() {
    if (!this.supported) return 'denied';
    try { return await Notification.requestPermission(); } catch { return 'denied'; }
  },

  /** Affiche une notification tout de suite (compatible ancienne API) */
  show(title, body, data = {}) { return showNow(title, body, data); },
};

/* ── Planification d'un rappel (déclenchement à l'heure exacte) ─────── */
export async function scheduleReminder(r) {
  if (!triggersSupported() || notif.permission !== 'granted') return;
  if (!r || r.triggered || !r.datetime) return;
  const ts = new Date(r.datetime).getTime();
  if (!Number.isFinite(ts) || ts <= Date.now()) return; // passé → ignoré

  const reg = await swReg();
  if (!reg?.showNotification) return;
  try {
    await reg.showNotification('⏰ Rappel StudyFlow', {
      tag:  TAG(r.id),               // même tag → remplace l'ancien
      body: r.message || 'Rappel',
      icon: ICON, badge: ICON,
      data: { url: '/reminders', id: r.id },
      showTrigger: new window.TimestampTrigger(ts),
    });
  } catch { /* noop */ }
}

/** Annule un rappel planifié (avant qu'il ne se déclenche) */
export async function cancelReminder(id) {
  const reg = await swReg();
  if (!reg?.getNotifications) return;
  try {
    const list = await reg.getNotifications({ tag: TAG(id), includeTriggered: false });
    list.forEach(n => n.close());
  } catch { /* noop */ }
}

/** (Re)planifie tous les rappels futurs — appelé après chaque load/sync */
export async function syncReminders(list = []) {
  if (!triggersSupported() || notif.permission !== 'granted') return;
  const now = Date.now();
  for (const r of list) {
    if (!r.triggered && new Date(r.datetime).getTime() > now) {
      await scheduleReminder(r);
    }
  }
}

/**
 * Démon d'avant-plan : vérifie les rappels échus chaque minute.
 * - Si les Triggers ne sont PAS supportés → affiche la notif (repli).
 * - Si supportés → la notif est déjà gérée par le trigger ; on se
 *   contente de marquer comme déclenché pour l'état de l'UI.
 * Appelé une fois depuis Layout.
 */
export function startReminderDaemon() {
  const check = async () => {
    if (notif.permission !== 'granted') return;
    const reminders = await db.all('reminders');
    const now = new Date();
    for (const r of reminders) {
      if (!r.triggered && new Date(r.datetime) <= now) {
        if (!triggersSupported()) await showNow('⏰ Rappel StudyFlow', r.message, { url: '/reminders' });
        await db.put('reminders', { ...r, triggered: true });
      }
    }
  };
  check();
  const id = setInterval(check, 60_000);
  return () => clearInterval(id);
}
