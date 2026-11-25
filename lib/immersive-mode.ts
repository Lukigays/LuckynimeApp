import { useEffect, type RefObject } from "react";
import { AppState, Dimensions, NativeModules, Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";

function getRawExpoNavigationBar(): {
  setBehaviorAsync?: (behavior: "overlay-swipe" | "inset-swipe" | "inset-touch") => Promise<void>;
  setVisibilityAsync?: (visibility: "visible" | "hidden") => Promise<void>;
} | null {
  if (Platform.OS !== "android") return null;
  try {
    const core = require("expo-modules-core") as {
      requireOptionalNativeModule?: (name: string) => unknown;
      requireNativeModule?: (name: string) => unknown;
    };
    if (typeof core.requireOptionalNativeModule === "function") {
      return (core.requireOptionalNativeModule("ExpoNavigationBar") as any) ?? null;
    }
    if (typeof core.requireNativeModule === "function") {
      return (core.requireNativeModule("ExpoNavigationBar") as any) ?? null;
    }
  } catch {}
  return null;
}

function getEdgeToEdgeModule(): {
  setStatusBarHidden?: (hidden: boolean) => void;
  setNavigationBarHidden?: (hidden: boolean) => void;
} | null {
  if (Platform.OS !== "android") return null;
  try {
    // Support both Old Architecture (NativeModules) and TurboModuleRegistry
    const turbo = require("react-native")?.TurboModuleRegistry?.get?.("RNEdgeToEdge");
    return (turbo ?? (NativeModules as Record<string, any>)?.RNEdgeToEdge) ?? null;
  } catch {
    return (NativeModules as Record<string, any>)?.RNEdgeToEdge ?? null;
  }
}

/**
 * Applies or restores true Sticky Immersive fullscreen on Android, hiding both
 * the status bar and the bottom gesture pill / 3-button navigation bar even
 * when `edgeToEdgeEnabled: true` is active in Expo SDK 54.
 */
export async function applyAndroidImmersiveBars(hidden: boolean): Promise<void> {
  if (Platform.OS !== "android") return;

  // 1. Sync RNEdgeToEdge internal state first so `onHostResume` / status-bar
  //    updates never re-show the gesture pill bar while fullscreen is active.
  try {
    const edgeToEdge = getEdgeToEdgeModule();
    edgeToEdge?.setStatusBarHidden?.(hidden);
    edgeToEdge?.setNavigationBarHidden?.(hidden);
  } catch {}

  // 2. Force transient swipe behavior directly via native ExpoNavigationBar
  //    (bypasses the JS edge-to-edge early return in expo-navigation-bar).
  const rawNav = getRawExpoNavigationBar();
  if (hidden) {
    try {
      await rawNav?.setBehaviorAsync?.("overlay-swipe");
    } catch {}
  }

  // 3. Apply navigation bar visibility via both raw module and public API.
  const target: "hidden" | "visible" = hidden ? "hidden" : "visible";
  try {
    if (rawNav?.setVisibilityAsync) {
      await rawNav.setVisibilityAsync(target);
    } else {
      await NavigationBar.setVisibilityAsync(target);
    }
  } catch {
    try {
      await NavigationBar.setVisibilityAsync(target);
    } catch {}
  }
}

/**
 * Keeps Android's bottom gesture pill / navigation bar hidden whenever
 * `immersive` is true, automatically re-hiding after orientation transitions,
 * modal dismissals, app resume, or transient edge swipes.
 */
export function useImmersiveSystemBars(
  immersive: boolean,
  triggers: ReadonlyArray<unknown> = [],
  skipRestoreOnUnmount?: RefObject<boolean>
): void {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    let cancelled = false;
    let rehideTimer: ReturnType<typeof setTimeout> | null = null;

    const enforce = () => {
      if (cancelled) return;
      void applyAndroidImmersiveBars(immersive);
    };

    enforce();
    // Re-apply after orientation / Dialog window transitions settle on Android
    const t1 = setTimeout(enforce, 90);
    const t2 = setTimeout(enforce, 320);
    const t3 = setTimeout(enforce, 750);

    let navSub: { remove: () => void } | null = null;
    if (immersive) {
      try {
        navSub = NavigationBar.addVisibilityListener(({ visibility }) => {
          if (!cancelled && visibility === "visible") {
            if (rehideTimer) clearTimeout(rehideTimer);
            rehideTimer = setTimeout(() => {
              if (!cancelled) void applyAndroidImmersiveBars(true);
            }, 1800);
          }
        });
      } catch {}
    }

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !cancelled) {
        enforce();
        setTimeout(enforce, 150);
      }
    });

    const dimSub = Dimensions.addEventListener("change", () => {
      if (!cancelled && immersive) {
        setTimeout(enforce, 80);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (rehideTimer) clearTimeout(rehideTimer);
      navSub?.remove();
      appStateSub.remove();
      dimSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immersive, ...triggers]);

  // Restore system bars when leaving the watch screen, not between episodes.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    return () => {
      // The navigation handoff is decided after mount, so read the live flag.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (!skipRestoreOnUnmount?.current) void applyAndroidImmersiveBars(false);
    };
  }, [skipRestoreOnUnmount]);
}
