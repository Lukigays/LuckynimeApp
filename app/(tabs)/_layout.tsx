import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Image } from "expo-image";
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
  { routeName: "index", label: "Beranda", icon: "home-outline", activeIcon: "home" },
  { routeName: "schedule", label: "Jadwal", icon: "calendar", activeIcon: "calendar-check" },
  { routeName: "history", label: "Riwayat", icon: "history", activeIcon: "history" },
  { routeName: "library", label: "Koleksi", icon: "bookmark-outline", activeIcon: "bookmark" },
  { routeName: "profile", label: "Profil", icon: "account-outline", activeIcon: "account", isProfile: true },
];

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <WibukuBottomBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "#121316" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Beranda" }} />
      <Tabs.Screen name="schedule" options={{ title: "Jadwal" }} />
      <Tabs.Screen name="history" options={{ title: "Riwayat" }} />
      <Tabs.Screen name="library" options={{ title: "Koleksi" }} />
      <Tabs.Screen name="profile" options={{ title: "Profil" }} />
      <Tabs.Screen name="catalog" options={{ href: null }} />
      <Tabs.Screen name="random" options={{ href: null }} />
    </Tabs>
  );
}

/**
 * Wibuku-style Flat Matte Dark Bottom Bar:
 * Minimalist icon bar with a soft slate capsule pill (#2C3040) around the active icon.
 */
function WibukuBottomBar({ state, navigation }: BottomTabBarProps) {
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
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {NAV_ITEMS.map((item) => {
        const focused = currentRouteName === item.routeName;
        const color = focused ? "#FFFFFF" : "#6B7280";
        return (
          <Pressable
            key={item.routeName}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={item.label}
            onPress={() => navigateTab(item.routeName)}
            style={({ pressed }) => [styles.tabItem, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.iconPill, focused && styles.iconPillActive]}>
              {item.isProfile && auth.user ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={[styles.avatar, focused && styles.avatarActive]}
                  contentFit="cover"
                />
              ) : (
                <AppIcon name={(focused ? item.activeIcon : item.icon) as any} size={22} color={color} />
              )}
            </View>
            <Text style={[styles.label, { color }, focused && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    backgroundColor: "#141519",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  iconPill: {
    width: 56,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPillActive: {
    backgroundColor: "#2C303E",
  },
  label: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 11,
  },
  labelActive: {
    fontFamily: "Nunito-Bold",
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  avatarActive: {
    borderColor: "#FFFFFF",
  },
});
