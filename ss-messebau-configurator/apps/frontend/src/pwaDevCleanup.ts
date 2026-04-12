/**
 * Unregisters stale service workers and clears PWA caches during development
 * to prevent cached assets from interfering with hot module replacement.
 */
export function cleanupPwaArtifactsForDev(): void {
  if (!import.meta.env.DEV) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });

  if (typeof caches !== "undefined") {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    });
  }
}
