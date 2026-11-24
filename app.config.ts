import type { ExpoConfig } from "expo/config";

const env = {
  appName: "Luckynime",
  appSlug: "luckynime",
  logoUrl: "/manus-storage/icon_cc474f8c.png",
  scheme: "luckynime",
  iosBundleId: "tech.luckynime.app",
  androidPackage: "luckynime.anime.app",
  easProjectId: "953bec0c-a3a0-467e-9b7c-7b030d1c5869",
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "2.1.5",
  orientation: "default",
  icon: "./assets/images/logo-app.png",
  scheme: env.scheme,
  userInterfaceStyle: "dark",
  // SDK 54 is the final Expo release that supports the proven legacy RN
  // architecture. Use it for the compatibility build after the new-architecture
  // APK terminated immediately on a Snapdragon 680 device.
  newArchEnabled: false,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    versionCode: 37,
    adaptiveIcon: { backgroundColor: "#121316", foregroundImage: "./assets/images/android-icon-foreground.png" },
    edgeToEdgeEnabled: true,
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: [
      "POST_NOTIFICATIONS",
      "SCHEDULE_EXACT_ALARM",
      "USE_EXACT_ALARM",
      "WAKE_LOCK",
      "RECEIVE_BOOT_COMPLETED",
      "REQUEST_INSTALL_PACKAGES",
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "BLUETOOTH_CONNECT",
    ],
    intentFilters: [
      { action: "VIEW", autoVerify: true, data: [{ scheme: env.scheme, host: "auth" }], category: ["BROWSABLE", "DEFAULT"] },
      { action: "VIEW", data: [{ scheme: env.scheme, host: "anime", pathPattern: ".*" }], category: ["BROWSABLE", "DEFAULT"] },
      { action: "VIEW", autoVerify: true, data: [{ scheme: "https", host: "luckynime.tech", pathPrefix: "/anime/" }], category: ["BROWSABLE", "DEFAULT"] },
    ],
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/images/logo-app.png" },
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-audio",
    "expo-font",
    "expo-navigation-bar",
    "./plugins/with-immersive-fullscreen",
    "expo-web-browser",
    ["react-native-video", { enableAndroidPictureInPicture: true }],
    ["expo-screen-orientation", { initialOrientation: "DEFAULT" }],
    ["expo-secure-store", { configureAndroidBackup: false }],
    ["expo-notifications", { icon: "./assets/images/logo-app.png", color: "#EF4444" }],
    ["expo-splash-screen", { image: "./assets/images/splash-icon.png", imageWidth: 160, resizeMode: "contain", backgroundColor: "#121316", dark: { backgroundColor: "#121316" } }],
    ["expo-build-properties", {
      android: {
        buildArchs: ["armeabi-v7a", "arm64-v8a", "x86_64"],
        minSdkVersion: 28,
        usesCleartextTraffic: true,
      }
    }],
    "@react-native-google-signin/google-signin",
    [
      "@livekit/react-native-expo-plugin",
      {
        android: {
          audioType: "communication",
        },
      },
    ],
    "@config-plugins/react-native-webrtc",
  ],
  // Keep file-route typing, but remove optional compiler/runtime experiments
  // from the compatibility build's startup path.
  experiments: { typedRoutes: true },
  // Over-the-air JS/asset updates (expo-updates). Only JS and asset changes
  // ship this way; native changes still need a new APK. runtimeVersion ties an
  // OTA bundle to a native build: 2.1.5 bundles only reach 2.1.5 APKs.
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: `https://u.expo.dev/${env.easProjectId}`,
    enabled: true,
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
    requestHeaders: { "expo-channel-name": "production" },
  },
  extra: { eas: { projectId: env.easProjectId } },
};

export default config;
