import React, { useState, useEffect, useCallback } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/app-icon";
import { hapticLight } from "@/lib/haptics";
import { useLuckynimeAuth } from "@/providers/auth-provider";
import { getTierForLevel } from "@/components/level-progress-modal";
import { DuniaView } from "@/components/dunia/dunia-view";
import { getCrystalBalance, deductCrystalBalance, addCrystalBalance } from "@/lib/topup-service";
import { getBorderByIdAsync } from "@/lib/avatar-borders";

// URL resmi Vercel NuePet Zoo (terhubung langsung ke database Supabase Luckynime)
const RAW_NUEPET_URL = process.env.EXPO_PUBLIC_NUEPET_URL;
const DEFAULT_NUEPET_URL =
  RAW_NUEPET_URL &&
  !RAW_NUEPET_URL.includes("localhost") &&
  !RAW_NUEPET_URL.includes("192.168.") &&
  !RAW_NUEPET_URL.includes("nuepet-zoo.vercel.app")
    ? RAW_NUEPET_URL
    : "https://nuepet-zoo-seven.vercel.app";

export default function NuePetZooScreen() {
  const auth = useLuckynimeAuth();
  const routeParams = useLocalSearchParams<{
    tab?: string;
    targetUserId?: string;
    targetName?: string;
    targetAvatar?: string;
    isVisitor?: string;
  }>();
  const initialTab = routeParams.tab;

  // Mode Pengunjung: Jika mengunjungi pet dari profil pengguna lain
  const isVisiting = Boolean(
    routeParams.isVisitor === "1" ||
      (routeParams.targetUserId && routeParams.targetUserId !== auth.user?.id)
  );
  const targetOwnerId =
    isVisiting && routeParams.targetUserId
      ? routeParams.targetUserId
      : auth.user?.id || "guest";
  const targetOwnerName =
    isVisiting && routeParams.targetName
      ? routeParams.targetName
      : auth.profile?.display_name || auth.profile?.username || "Pengasuh";
  const targetOwnerAvatar =
    isVisiting && routeParams.targetAvatar
      ? routeParams.targetAvatar
      : auth.profile?.avatar_url || "";

  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Saldo Crystal Luckynime untuk Gacha & Upgrade di NuePet (hanya berlaku untuk pemilik)
  const [userCrystals, setUserCrystals] = useState<number>(0);

  useEffect(() => {
    if (isVisiting) return;
    let mounted = true;
    getCrystalBalance(auth.user?.id)
      .then((bal) => {
        if (mounted) setUserCrystals(bal);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [auth.user?.id, isVisiting]);

  const handleBack = useCallback(() => {
    hapticLight();
    router.back();
  }, []);

  // Handle postMessage dari NuePet Zoo webview/iframe (termasuk tombol kembali in-app & sinkron crystal)
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const handleWebMessage = async (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!data) return;
        if (data.type === "CLOSE_NUEPET") {
          handleBack();
          return;
        }
        if (isVisiting) return;
        if (data.type === "UPDATE_CRYSTALS" && typeof data.crystals === "number") {
          setUserCrystals(data.crystals);
        } else if (data.type === "ADD_CRYSTALS") {
          const amount = Number(data.amount) || 0;
          if (amount > 0) {
            await addCrystalBalance(auth.user?.id, amount);
            const newBal = await getCrystalBalance(auth.user?.id);
            setUserCrystals(newBal);
          }
        } else if (data.type === "DEDUCT_CRYSTALS") {
          const amount = Number(data.amount) || 0;
          if (amount > 0) {
            await deductCrystalBalance(auth.user?.id, amount);
            const newBal = await getCrystalBalance(auth.user?.id);
            setUserCrystals(newBal);
          }
        }
      } catch {}
    };

    window.addEventListener("message", handleWebMessage);
    return () => window.removeEventListener("message", handleWebMessage);
  }, [auth.user?.id, isVisiting, handleBack]);

  // Identitas profil pengguna
  const userLevel = Number(auth.profile?.level) || 1;
  const tierInfo = getTierForLevel(userLevel, auth.profile?.role);
  const rankName = tierInfo?.currentTier?.name?.toUpperCase() || "STONE";
  const displayName = auth.profile?.display_name || auth.profile?.username || "Pengasuh";
  const avatarUrl = auth.profile?.avatar_url || "";
  const equippedBorder = auth.profile?.equipped_border || "";
  const isVip = Boolean(auth.profile?.is_vip);
  const userId = auth.user?.id || "guest";

  const [resolvedBorderUrl, setResolvedBorderUrl] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    const raw = auth.profile?.equipped_border;
    if (!raw) {
      setResolvedBorderUrl("");
      return;
    }
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/")) {
      setResolvedBorderUrl(raw);
      return;
    }
    getBorderByIdAsync(raw)
      .then((b) => {
        if (mounted && b?.assetUrl) {
          setResolvedBorderUrl(b.assetUrl);
        } else if (mounted) {
          setResolvedBorderUrl(raw);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [auth.profile?.equipped_border]);

  const initialCrystalsRef = React.useRef<number | null>(null);
  if (initialCrystalsRef.current === null && userCrystals > 0) {
    initialCrystalsRef.current = userCrystals;
  }

  const targetUrl = React.useMemo(() => {
    const baseUrl = DEFAULT_NUEPET_URL.replace(/\/$/, "");
    const userExp = Number(auth.profile?.exp) || 0;
    const initialCrystals = initialCrystalsRef.current ?? userCrystals;
    const params = new URLSearchParams({
      inApp: "1",
      uid: targetOwnerId,
      targetUid: targetOwnerId,
      targetName: targetOwnerName,
      isVisitor: isVisiting ? "1" : "0",
      visitorUid: userId,
      visitorName: displayName,
      name: targetOwnerName,
      level: String(userLevel),
      exp: String(userExp),
      rank: rankName,
      avatar: isVisiting ? targetOwnerAvatar : avatarUrl,
      border: resolvedBorderUrl || equippedBorder,
      vip: isVip ? "1" : "0",
      crystals: String(initialCrystals || 0),
      ...(initialTab ? { tab: initialTab } : {}),
    });
    return `${baseUrl}/?${params.toString()}`;
  }, [
    targetOwnerId,
    targetOwnerName,
    isVisiting,
    targetOwnerAvatar,
    userId,
    displayName,
    userLevel,
    rankName,
    avatarUrl,
    resolvedBorderUrl,
    equippedBorder,
    isVip,
    initialTab,
    reloadKey,
    userCrystals,
    auth.profile?.exp,
  ]);

  const handleRefresh = () => {
    hapticLight();
    setHasError(false);
    setReloadKey((k) => k + 1);
  };

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, !hasError && styles.skyContainer]}
    >
      <StatusBar style={hasError ? "light" : "dark"} translucent backgroundColor="transparent" />

      {hasError ? (
        <View style={styles.errorContainer}>
          <AppIcon name="alert-circle" size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>Koneksi Terputus</Text>
          <Text style={styles.errorDesc}>
            Gagal memuat NuePet Zoo. Pastikan koneksi internet aktif lalu coba lagi.
          </Text>
          <View style={styles.errorBtnRow}>
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [styles.backErrorBtn, pressed && styles.btnPressed]}
            >
              <AppIcon name="arrow-left" size={18} color="#FFFFFF" />
              <Text style={styles.retryBtnText}>Kembali</Text>
            </Pressable>
            <Pressable
              onPress={handleRefresh}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.btnPressed]}
            >
              <AppIcon name="refresh" size={18} color="#FFFFFF" />
              <Text style={styles.retryBtnText}>Coba Lagi</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.webviewContainer}>
          <DuniaView
            key={reloadKey}
            url={targetUrl}
            onError={() => setHasError(true)}
            onMessage={(data) => {
              if (!data) return;
              if (data.type === "CLOSE_NUEPET") {
                handleBack();
                return;
              }
              if (isVisiting) return;
              if (data.type === "UPDATE_CRYSTALS" && typeof data.crystals === "number") {
                setUserCrystals(data.crystals);
              } else if (data.type === "ADD_CRYSTALS") {
                const amount = Number(data.amount) || 0;
                if (amount > 0) {
                  void addCrystalBalance(auth.user?.id, amount)
                    .then(() => getCrystalBalance(auth.user?.id))
                    .then((newBal) => setUserCrystals(newBal));
                }
              } else if (data.type === "DEDUCT_CRYSTALS") {
                const amount = Number(data.amount) || 0;
                if (amount > 0) {
                  void deductCrystalBalance(auth.user?.id, amount)
                    .then(() => getCrystalBalance(auth.user?.id))
                    .then((newBal) => setUserCrystals(newBal));
                }
              }
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0E14",
  },
  skyContainer: {
    backgroundColor: "#7CC5F8",
  },
  btnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: "#7CC5F8",
  },
  errorContainer: {
    flex: 1,
    backgroundColor: "#0B0E14",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  errorTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  errorDesc: {
    fontSize: 13.5,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
  },
  errorBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  backErrorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#2563EB",
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
