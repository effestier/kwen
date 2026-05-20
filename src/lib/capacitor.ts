import { isNativePlatform } from './platform';

export async function initCapacitor() {
  if (!isNativePlatform()) return;

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const { Keyboard } = await import('@capacitor/keyboard');
    const { App } = await import('@capacitor/app');

    // Status bar
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0a0a0b' });

    // Hide splash after app is ready
    await SplashScreen.hide();

    // Android back button
    App.addListener('backButton', ({ canGoBack }) => {
      if (!canGoBack) {
        App.exitApp();
      } else {
        window.history.back();
      }
    });
  } catch (err) {
    console.error('Capacitor init failed:', err);
  }
}
