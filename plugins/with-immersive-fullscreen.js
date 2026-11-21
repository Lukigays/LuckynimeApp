const { withAndroidStyles, withMainActivity } = require("expo/config-plugins");

/**
 * Ensures true edge-to-edge immersive fullscreen video playback on Android:
 * - Disables forced navigation bar contrast scrim behind gesture pill bars
 * - Extends fullscreen video across the entire physical screen including
 *   camera punch-hole / display cutout regions in landscape (API 28–36+)
 */
module.exports = function withImmersiveFullscreen(config) {
  config = withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults?.resources?.style ?? [];
    const appTheme = styles.find((s) => s?.$?.name === "AppTheme");
    if (appTheme) {
      appTheme.item = Array.isArray(appTheme.item) ? appTheme.item : [];

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

  config = withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes("LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS")) {
      const cutoutSnippet = [
        "    super.onCreate(null)",
        "    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {",
        "      window.attributes = window.attributes.apply {",
        "        layoutInDisplayCutoutMode = android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS",
        "      }",
        "    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {",
        "      window.attributes = window.attributes.apply {",
        "        layoutInDisplayCutoutMode = android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES",
        "      }",
        "    }",
      ].join("\n");
      contents = contents.replace("    super.onCreate(null)", cutoutSnippet);
      cfg.modResults.contents = contents;
    }
    return cfg;
  });

  return config;
};
