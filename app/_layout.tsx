import { useState, useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProviders } from "@/providers/app-providers";
import { nothing } from "@/components/nothing-ui";
import { ConnectivitySignal } from "@/components/connectivity-signal";
import { AppUpdatePrompt } from "@/components/app-update-prompt";
import { SupportPrompt } from "@/components/support-prompt";
import { AniListDownBanner } from "@/components/anilist-down-banner";
import { FirstRunOnboarding } from "@/components/first-run-onboarding";
import { useStartupPrefetch } from "@/hooks/use-startup-prefetch";
import { AiringReminderScheduler } from "@/hooks/use-airing-reminders";
import { ChoiceSheetProvider } from "@/components/choice-sheet";
import { AppAnnouncementModal } from "@/components/app-announcement-modal";
import { MiniVideoPlayer } from "@/components/mini-video-player";
import { MaintenanceGate } from "@/components/maintenance-gate";
import { BroadcastNotificationListener } from "@/components/broadcast-notification-listener";
import { AppIcon } from "@/components/app-icon";

const APP_BG_COLOR = "#121316";

// Pastikan splash screen native tetap bertahan hingga view loading.gif siap
void SplashScreen.preventAutoHideAsync().catch(() => {});

if (Platform.OS !== "web") {
  try {
    const { registerGlobals } = require("@livekit/react-native");
    registerGlobals();
  } catch (e) {
    console.warn("[App] LiveKit registerGlobals failed:", e);
  }
}

/** Must render inside AppProviders — calls useQueryClient. */
function StartupPrefetcher() {
  useStartupPrefetch();
  return null;
}

// Set Nunito as the global default font (matching the welcome / onboarding theme).
// Text and TextInput are class components in RN so defaultProps works at runtime.
// @ts-expect-error — defaultProps is removed from RN 0.81 types but still functions
Text.defaultProps = { ...(Text.defaultProps ?? {}), style: [{ fontFamily: "Nunito-SemiBold" }, Text.defaultProps?.style].filter(Boolean) };
// @ts-expect-error — same as above
TextInput.defaultProps = { ...(TextInput.defaultProps ?? {}), style: [{ fontFamily: "Nunito-SemiBold" }, TextInput.defaultProps?.style].filter(Boolean) };

export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "Nunito-Regular": require("../assets/fonts/Nunito-Regular.ttf"),
    "Nunito-SemiBold": require("../assets/fonts/Nunito-SemiBold.ttf"),
    "Nunito-Bold": require("../assets/fonts/Nunito-Bold.ttf"),
    "Nunito-ExtraBold": require("../assets/fonts/Nunito-ExtraBold.ttf"),
    "Nunito-Black": require("../assets/fonts/Nunito-Black.ttf"),
  });

  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const entranceAnim = useRef(new Animated.Value(0)).current;
  const wordAnim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(APP_BG_COLOR).catch(() => {});
    void SplashScreen.hideAsync().catch(() => {});

    Animated.parallel([
      Animated.spring(entranceAnim, {
        toValue: 1,
        tension: 65,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(wordAnim, {
        toValue: 1,
        duration: 520,
        delay: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const barLoop = Animated.loop(
      Animated.timing(barAnim, {
        toValue: 1,
        duration: 1050,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    barLoop.start();

    const timer = setTimeout(() => {
      setMinSplashElapsed(true);
    }, 1300);

    return () => {
      clearTimeout(timer);
      barLoop.stop();
    };
  }, [barAnim, entranceAnim, wordAnim]);

  const showSplash = !fontsLoaded || !minSplashElapsed;

  if (showSplash) {
    const starScale = entranceAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    });
    const starRotate = entranceAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["-75deg", "0deg"],
    });
    const wordTranslateX = wordAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-18, 0],
    });
    const barTranslate = barAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-130, 175],
    });

    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: APP_BG_COLOR }}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <View
          style={{
            flex: 1,
            backgroundColor: APP_BG_COLOR,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          {/* Crisp Horizontal Cinema Brand Lockup — zero circles or boxy backgrounds */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Animated.View
              style={{
                opacity: entranceAnim,
                transform: [{ scale: starScale }, { rotate: starRotate }],
                marginRight: 8,
              }}
            >
              <Image
                source={require("../assets/images/android-icon-foreground.png")}
                style={{ width: 64, height: 64 }}
                contentFit="contain"
              />
            </Animated.View>

            <Animated.View
              style={{
                opacity: wordAnim,
                transform: [{ translateX: wordTranslateX }],
                flexDirection: "row",
                alignItems: "baseline",
              }}
            >
              <Text
                style={{
                  fontSize: 34,
                  fontWeight: "800",
                  letterSpacing: -0.5,
                  color: "#F3F4F6",
                }}
              >
                Lucky
              </Text>
              <Text
                style={{
                  fontSize: 34,
                  fontWeight: "800",
                  letterSpacing: -0.5,
                  color: "#EF4444",
                }}
              >
                nime
              </Text>
            </Animated.View>
          </View>

          {/* Razor-thin horizontal laser line (sharp edges, not circular) */}
          <Animated.View
            style={{
              opacity: wordAnim,
              marginTop: 18,
              width: 172,
              height: 2,
              borderRadius: 99,
              backgroundColor: "rgba(255, 255, 255, 0.16)",
              overflow: "hidden",
            }}
          >
            <Animated.View
              style={{
                width: 68,
                height: 2,
                borderRadius: 99,
                backgroundColor: "#EF4444",
                transform: [{ translateX: barTranslate }],
              }}
            />
          </Animated.View>

          <Animated.Text
            style={{
              opacity: wordAnim,
              marginTop: 12,
              fontSize: 9.5,
              fontWeight: "700",
              letterSpacing: 0.2,
              color: "#FFFFFF",
              textAlign: "center",
            }}
          >
            SAKURA CINEMA EDITION
          </Animated.Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: APP_BG_COLOR }}>
      <SafeAreaProvider>
        <AppProviders>
          <ChoiceSheetProvider>
            <StartupPrefetcher />
            <AiringReminderScheduler />
            <StatusBar style="light" translucent backgroundColor="transparent" />
            <Stack
              screenOptions={{
                headerShown: false,
                animation: "fade",
                contentStyle: { backgroundColor: APP_BG_COLOR },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="anime/[id]" />
              <Stack.Screen name="watch/[id]" />
              <Stack.Screen name="search" options={{ presentation: "card" }} />
              <Stack.Screen name="auth" options={{ presentation: "modal" }} />
              <Stack.Screen name="settings" options={{ presentation: "modal" }} />
              <Stack.Screen name="support" options={{ presentation: "modal" }} />
              <Stack.Screen name="library" />
              <Stack.Screen name="legal" options={{ presentation: "modal" }} />
              <Stack.Screen name="topup" options={{ presentation: "card" }} />
              <Stack.Screen name="inventory" options={{ presentation: "card" }} />
              <Stack.Screen name="avatar-decorations" options={{ presentation: "card" }} />
              <Stack.Screen name="developer" options={{ presentation: "card" }} />
              <Stack.Screen name="nobar/index" options={{ presentation: "card" }} />
              <Stack.Screen name="nobar/[id]" options={{ presentation: "card" }} />
              <Stack.Screen name="lelang" options={{ presentation: "card" }} />
            </Stack>
            <ConnectivitySignal />
            <AppUpdatePrompt />
            <SupportPrompt />
            <AniListDownBanner />
            <FirstRunOnboarding onComplete={() => {}} />
            <MaintenanceGate />
            <BroadcastNotificationListener />
            <MiniVideoPlayer />
            <AppAnnouncementModal />
          </ChoiceSheetProvider>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const [pressed, setPressed] = useState(false);

  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
        padding: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#121316",
      }}
    >
      <StatusBar style="light" />

      {/* Ambient background glow */}
      <View
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          borderRadius: 160,
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          top: "28%",
        }}
        pointerEvents="none"
      />

      {/* Liquid Glass Container Card */}
      <View
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 28,
          borderRadius: 24,
          backgroundColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.08)",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* Status Pill Badge */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 20,
            backgroundColor: "rgba(239, 68, 68, 0.12)",
            borderWidth: 1,
            borderColor: "rgba(239, 68, 68, 0.28)",
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "#EF4444",
            }}
          />
          <Text
            style={{
              color: "#F87171",
              fontFamily: "Nunito-Bold",
              fontSize: 10.5,
              letterSpacing: 0.2,
            }}
          >
            APPLICATION STATE
          </Text>
        </View>

        {/* Brand Title: Luckynime */}
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 22,
            fontWeight: "900",
            fontFamily: "Nunito-Bold",
            textAlign: "center",
            letterSpacing: 0.3,
          }}
        >
          Luckynime needs to restart this screen.
        </Text>

        {/* Error Detail Glass Box */}
        <View
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            backgroundColor: "rgba(0, 0, 0, 0.40)",
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.06)",
          }}
        >
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 12.5,
              lineHeight: 18,
              textAlign: "center",
              fontFamily: "Nunito-Regular",
            }}
          >
            {error.message || "An unexpected state occurred."}
          </Text>
        </View>

        {/* Liquid Glass Silver Retry Button */}
        <Pressable
          onPress={retry}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minHeight: 48,
            paddingHorizontal: 32,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: pressed
              ? "rgba(255, 255, 255, 0.22)"
              : "rgba(255, 255, 255, 0.12)",
            borderWidth: 1,
            borderColor: pressed
              ? "rgba(255, 255, 255, 0.45)"
              : "rgba(255, 255, 255, 0.28)",
            marginTop: 4,
          }}
        >
          <AppIcon name="refresh" size={17} color="#FFFFFF" />
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: "900",
              fontFamily: "Nunito-Bold",
              letterSpacing: 0.2,
            }}
          >
            Retry
          </Text>
        </Pressable>
      </View>
    </GestureHandlerRootView>
  );
}
