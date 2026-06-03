// Capacitor: hide splash screen and prevent landing page flash
(function() {
  try {
    if (window.Capacitor) {
      // Hide all content immediately on native to prevent landing page flash
      var s = document.createElement('style');
      s.textContent = 'body { opacity: 0 !important; pointer-events: none !important; }';
      document.documentElement.appendChild(s);
      window.__capacitorStyle = s;

      // Hide Capacitor splash screen
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen) {
        window.Capacitor.Plugins.SplashScreen.hide();
      }
    }
  } catch(e) {}
})();
