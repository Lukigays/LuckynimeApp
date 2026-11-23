import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { AppIcon } from "@/components/app-icon";
import { useLuckynimeAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";

const DEFAULT_AVATAR_URL = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

type NavItem = {
  routeName: string;
  label: string;
  icon: string;
  activeIcon: string;
  isProfile?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { routeName: "index", label: "Eksplor", icon: "home-outline", activeIcon: "home" },
  { routeName: "schedule", label: "Rilis", icon: "calendar", activeIcon: "calendar-check" },
  { routeName: "library", label: "Koleksi", icon: "bookmark-outline", activeIcon: "bookmark" },
  { routeName: "history", label: "Jejak", icon: "history", activeIcon: "history" },
  { routeName: "profile", label: "Akun", icon: "account-outline", activeIcon: "account", isProfile: true },
];

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <KuroSakuraDock {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "#0D080B" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Eksplor" }} />
      <Tabs.Screen name="schedule" options={{ title: "Rilis" }} />
      <Tabs.Screen name="library" options={{ title: "Koleksi" }} />
      <Tabs.Screen name="history" options={{ title: "Jejak" }} />
      <Tabs.Screen name="profile" options={{ title: "Akun" }} />
      <Tabs.Screen name="catalog" options={{ href: null }} />
      <Tabs.Screen name="random" options={{ href: null }} />
    </Tabs>
  );
}

function KuroSakuraDock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const auth = useLuckynimeAuth();
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const currentRouteName = state.routes[state.index]?.name ?? "index";

  useEffect(() => {
    const uid = auth.user?.id;
    if (!uid) {
      setProfileAvatar(null);
      return;
    }

    let mounted = true;
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted && data?.avatar_url) {
          setProfileAvatar(data.avatar_url);
        }
      });

    const channel = supabase
      .channel(`tab_avatar_${uid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${uid}`,
        },
        (payload) => {
          const nextAvatar = (payload.new as any)?.avatar_url;
          if (mounted && nextAvatar) {
            setProfileAvatar(nextAvatar);
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [auth.user?.id]);

  const avatarUri =
    profileAvatar ||
    auth.profile?.avatar_url ||
    auth.user?.user_metadata?.avatar_url ||
    DEFAULT_AVATAR_URL;

  const bottomOffset = Math.max(insets.bottom, 10);

  const navigateTab = (routeName: string) => {
    const targetRoute = state.routes.find((r) => r.name === routeName);
    if (!targetRoute) return;

    const focused = currentRouteName === routeName;
    const event = navigation.emit({
      type: "tabPress",
      target: targetRoute.key,
      canPreventDefault: true,
    });

    if (!focused && !event.defaultPrevented) {
      void Haptics.selectionAsync();
      navigation.navigate(targetRoute.name, targetRoute.params);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dockWrapper, { bottom: bottomOffset }]}
    >
      <View style={styles.unifiedDock}>
        <LinearGradient
          colors={["rgba(244, 63, 94, 0.42)", "rgba(251, 113, 133, 0.12)", "rgba(244, 63, 94, 0.36)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.topGlowHairline}
        />
        {NAV_ITEMS.map((item) => {
          const active = currentRouteName === item.routeName;
          return (
            <Pressable
              key={item.routeName}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => navigateTab(item.routeName)}
              style={({ pressed }) => [styles.tabSlot, pressed && styles.pressed]}
            >
              {active ? <View style={styles.activeLaserBar} /> : null}
              <View style={[styles.iconPill, active && styles.iconPillActive]}>
                {item.isProfile ? (
                  <View style={[styles.avatarRing, active && styles.avatarRingActive]}>
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.avatarImg}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  </View>
                ) : (
                  <AppIcon
                    name={(active ? item.activeIcon : item.icon) as any}
                    size={20}
                    color={active ? "#FFF5F7" : "#8D707D"}
                  />
                )}
              </View>
              <Text
                style={[styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelInactive]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dockWrapper: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 100,
  },
  unifiedDock: {
    height: 66,
    borderRadius: 22,
    backgroundColor: "rgba(20, 11, 16, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 16,
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        } as any)
      : {}),
  },
  topGlowHairline: {
    position: "absolute",
    top: 0,
    left: 18,
    right: 18,
    height: 1.5,
  },
  tabSlot: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    position: "relative",
  },
  activeLaserBar: {
    position: "absolute",
    top: 0,
    width: 24,
    height: 3,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: "#F43F5E",
  },
  iconPill: {
    width: 40,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPillActive: {
    backgroundColor: "rgba(244, 63, 94, 0.20)",
    borderWidth: 1,
    borderColor: "rgba(251, 113, 133, 0.34)",
  },
  avatarRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(251, 113, 133, 0.35)",
  },
  avatarRingActive: {
    borderColor: "#F43F5E",
    borderWidth: 2,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.15,
  },
  tabLabelActive: {
    color: "#FB7185",
    fontFamily: "Nunito-ExtraBold",
    fontWeight: "800",
  },
  tabLabelInactive: {
    color: "#8D707D",
    fontFamily: "Nunito-SemiBold",
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
