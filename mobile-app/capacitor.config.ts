import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ph.shopledger.mobile',
  appName: 'Shop Ledger PH',
  webDir: 'www',
  server: {
    // Shop Wi-Fi is plain http: allow the WebView to reach it and call it.
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
