export const notif = {
  get supported() { return typeof window !== 'undefined' && 'Notification' in window; },
  get permission() { return this.supported ? Notification.permission : 'denied'; },

  async request() {
    if (!this.supported) return 'denied';
    return Notification.requestPermission();
  },

  show(title, body, icon = '📚') {
    if (this.permission !== 'granted') return;
    try {
      new Notification(title, { body, icon: undefined, badge: undefined });
    } catch (_) {}
  },
};
