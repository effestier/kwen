// Unregister legacy service workers and clear stale caches
(function() {
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      registrations.forEach(function(reg) { reg.unregister(); });
    });
  }
  if (typeof caches !== 'undefined') {
    caches.keys().then(function(names) {
      names.forEach(function(name) { caches.delete(name); });
    });
  }
})();
