import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <View style={styles.row}>
        {NAV_ITEMS.map((item) => {
          const focused = currentRouteName === item.routeName;
          return (
            <Pressable
              key={item.routeName}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={item.label}
              onPress={() => navigateTab(item.routeName)}
              style={({ pressed }) => [styles.tabItem, pressed && { opacity: 0.72 }]}
            >
              <View style={[styles.iconPill, focused && styles.iconPillActive]}>
                {item.isProfile && auth.user ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={[styles.avatar, focused && styles.avatarActive]}
                    contentFit="cover"
                  />
                ) : (
                  <AppIcon
                    name={(focused ? item.activeIcon : item.icon) as any}
                    size={21}
                    color={focused ? "#FFFFFF" : "#8E93A2"}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#141519",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#242731",
    paddingTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: 44,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  iconPill: {
    width: 54,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPillActive: {
    backgroundColor: "#2D3142",
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  avatarActive: {
    borderColor: "#FFFFFF",
  },
});
