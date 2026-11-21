const { withAndroidStyles } = require("expo/config-plugins");

/**
 * Ensures true edge-to-edge immersive fullscreen video playback on Android:
 * - Disables forced navigation bar contrast scrim behind gesture pill bars
 * - Extends fullscreen video smoothly into short-edge display cutouts in landscape
 */
module.exports = function withImmersiveFullscreen(config) {
  return withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults?.resources?.style ?? [];
    const appTheme = styles.find((s) => s?.$?.name === "AppTheme");
    if (appTheme) {
      appTheme.item = Array.isArray(appTheme.item) ? appTheme.item : [];

      // Disable forced contrast scrim on Android 10+ gesture pill bar
      const contrastIdx = appTheme.item.findIndex(
        (it) => it?.$?.name === "android:enforceNavigationBarContrast"
      );
      const contrastItem = {
        $: { name: "android:enforceNavigationBarContrast", "tools:targetApi": "29" },
        _: "false",
      };
      if (contrastIdx >= 0) {
        appTheme.item[contrastIdx] = contrastItem;
      } else {
        appTheme.item.push(contrastItem);
      }

      // Allow fullscreen landscape video to span edge-to-edge across camera cutouts
      const cutoutIdx = appTheme.item.findIndex(
        (it) => it?.$?.name === "android:windowLayoutInDisplayCutoutMode"
      );
      const cutoutItem = {
        $: { name: "android:windowLayoutInDisplayCutoutMode", "tools:targetApi": "28" },
        _: "shortEdges",
      };
      if (cutoutIdx >= 0) {
        appTheme.item[cutoutIdx] = cutoutItem;
      } else {
        appTheme.item.push(cutoutItem);
      }
    }
    return cfg;
  });
};
