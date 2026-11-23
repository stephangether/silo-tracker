// Lokale Benachrichtigungen + App-Badge (ohne Push-Server).

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function permission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/** Muss aus einer Nutzeraktion (Tap) heraus aufgerufen werden. */
export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

export async function showNotification(title, body, tag) {
  if (permission() !== 'granted') return false;
  const options = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './' } };
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, options);
    return true;
  } catch {
    try {
      new Notification(title, options);
      return true;
    } catch {
      return false;
    }
  }
}

export async function setBadge(count) {
  try {
    if (count > 0) await navigator.setAppBadge?.(count);
    else await navigator.clearAppBadge?.();
  } catch {
    /* Badge nicht erlaubt/unterstützt */
  }
}
