import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { AppIcon } from "@/components/app-icon";
import { hapticLight } from "@/lib/haptics";
import { getLevelProgressInfo } from "@/lib/user-level";

export type ExpToastData = {
  id: string;
  totalXp: number;
  baseXp: number;
  bonusXp?: number;
  description: string;
  level: number;
  oldLevel?: number;
  levelUp?: boolean;
  newTotalXp: number;
  isVip?: boolean;
};

export type ExpPopupToastProps = {
  data: ExpToastData | null;
  onDismiss: () => void;
};

const USE_NATIVE_DRIVER = Platform.OS !== "web";
const AUTO_DISMISS_MS = 3200;

export const ExpPopupToast = memo(function ExpPopupToast({
  data,
  onDismiss,
}: ExpPopupToastProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 44, 304);

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(-36)).current;
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRef = useRef(false);

  const clearAutoTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const animateDismissUp = useCallback(
    (fromSwipe = false) => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      clearAutoTimer();
      if (fromSwipe) {
        hapticLight();
      }
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: fromSwipe ? 170 : 220,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(translateYAnim, {
          toValue: -130,
          duration: fromSwipe ? 170 : 220,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(() => {
        onDismiss();
      });
    },
    [clearAutoTimer, onDismiss, opacityAnim, translateYAnim]
  );

  const scheduleAutoDismiss = useCallback(
    (delayMs = AUTO_DISMISS_MS) => {
      clearAutoTimer();
      dismissTimerRef.current = setTimeout(() => {
        animateDismissUp(false);
      }, delayMs);
    },
    [animateDismissUp, clearAutoTimer]
  );

  useEffect(() => {
    if (!data) return;
    dismissedRef.current = false;
    opacityAnim.setValue(0);
    translateYAnim.setValue(-36);

    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 230,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.spring(translateYAnim, {
        toValue: 0,
        damping: 16,
        stiffness: 180,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();

    scheduleAutoDismiss(AUTO_DISMISS_MS);

    return () => {
      clearAutoTimer();
    };
  }, [data, opacityAnim, translateYAnim, scheduleAutoDismiss, clearAutoTimer]);

  // Swipe-up gesture seperti notifikasi handphone
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gs) =>
          Math.abs(gs.dy) > 3 && Math.abs(gs.dy) >= Math.abs(gs.dx) * 0.7,
        onPanResponderGrant: () => {
          clearAutoTimer();
        },
        onPanResponderMove: (_evt, gs) => {
          if (dismissedRef.current) return;
          if (gs.dy < 0) {
            translateYAnim.setValue(gs.dy);
            const nextOpacity = Math.max(0.15, 1 - Math.abs(gs.dy) / 110);
            opacityAnim.setValue(nextOpacity);
          } else {
            // Rubber-band lembut bila ditarik sedikit ke bawah
            translateYAnim.setValue(Math.min(14, gs.dy * 0.18));
            opacityAnim.setValue(1);
          }
        },
        onPanResponderRelease: (_evt, gs) => {
          if (dismissedRef.current) return;
          // Jika digeser ke atas >= 18px atau di-flick cepat ke atas -> langsung hilangkan!
          if (gs.dy <= -18 || gs.vy < -0.32) {
            animateDismissUp(true);
            return;
          }
          // Kembalikan mulus ke posisi semula
          Animated.parallel([
            Animated.spring(translateYAnim, {
              toValue: 0,
              damping: 16,
              stiffness: 200,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(opacityAnim, {
              toValue: 1,
              duration: 150,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]).start();
          scheduleAutoDismiss(2000);
        },
        onPanResponderTerminate: () => {
          if (dismissedRef.current) return;
          Animated.parallel([
            Animated.spring(translateYAnim, {
              toValue: 0,
              damping: 16,
              stiffness: 200,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(opacityAnim, {
              toValue: 1,
              duration: 150,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]).start();
          scheduleAutoDismiss(2000);
        },
      }),
    [animateDismissUp, clearAutoTimer, opacityAnim, scheduleAutoDismiss, translateYAnim]
  );

  if (!data) return null;

  const levelInfo = getLevelProgressInfo(data.newTotalXp);
  const bonusXp = data.bonusXp || 0;
  const isLevelUp = Boolean(data.levelUp && (data.oldLevel ?? 0) < data.level);

  return (
    <View style={styles.toastWrapper} pointerEvents="box-none">
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.container,
          {
            width: cardWidth,
            opacity: opacityAnim,
            transform: [{ translateY: translateYAnim }],
          },
        ]}
      >
        {/* Indikator Garis Geser ke Atas (Notifikasi HP) */}
        <View style={styles.swipeHandleWrap}>
          <View style={styles.swipeHandlePill} />
        </View>

        {/* Banner Khusus Ketika LEVEL UP */}
        {isLevelUp ? (
          <View style={styles.levelUpBanner}>
            <AppIcon name="party-popper" size={12} color="#FBBF24" />
            <Text style={styles.levelUpBannerText}>
              LEVEL UP! Lv.{data.oldLevel ?? data.level - 1} → Lv.{data.level}
            </Text>
          </View>
        ) : null}

        {/* ─── 1. BARIS ATAS COMPACT: IKON PANAH + EXP + LEVEL BADGE ─── */}
        <View style={styles.topRow}>
          <View style={styles.topLeftGroup}>
            <View style={styles.arrowCircle}>
              <AppIcon name="arrow-up" size={15} color="#38BDF8" />
            </View>
            <View style={styles.expTitleRow}>
              <Text style={styles.expValue}>+{data.totalXp}</Text>
              <Text style={styles.expUnit}> EXP</Text>
            </View>
          </View>

          <View style={styles.levelPill}>
            <Text style={styles.levelPillText}>Lv. {data.level}</Text>
          </View>
        </View>

        {/* ─── 2. KOTAK TENGAH RAMPING: BASE & PREMIUM / DESKRIPSI ─── */}
        <View style={styles.detailBox}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel} numberOfLines={1}>
              {bonusXp > 0 || data.isVip
                ? "Base EXP"
                : data.description || "Aktivitas Terverifikasi"}
            </Text>
            <Text style={styles.detailValue}>+{data.baseXp} xp</Text>
          </View>

          {bonusXp > 0 || data.isVip ? (
            <View style={[styles.detailRow, { marginTop: 3 }]}>
              <View style={styles.premiumLabelWrap}>
                <Text style={styles.detailLabel}>Bonus VIP</Text>
                <Text style={styles.premiumPercent}>(+50%)</Text>
              </View>
              <Text style={styles.detailValueAccent}>+{bonusXp} xp</Text>
            </View>
          ) : null}
        </View>

        {/* ─── 3. BARIS BAWAH + PROGRESS BAR TIPIS ─── */}
        <View style={styles.bottomRow}>
          <Text style={styles.swipeHintText}>Geser ke atas untuk tutup</Text>
          <Text style={styles.remainingXpText}>
            Sisa {levelInfo.xpRemaining.toLocaleString("id-ID")} xp
          </Text>
        </View>

        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.max(4, levelInfo.progressPercent)}%` },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  toastWrapper: {
    position: "absolute",
    top: Platform.OS === "ios" ? 48 : 36,
    left: 0,
    right: 0,
    zIndex: 999999,
    alignItems: "center",
    justifyContent: "center",
    elevation: 999,
  },
  container: {
    backgroundColor: "rgba(15, 20, 32, 0.96)",
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingTop: 7,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 12,
  },
  swipeHandleWrap: {
    alignItems: "center",
    marginBottom: 5,
  },
  swipeHandlePill: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(148, 163, 184, 0.35)",
  },
  levelUpBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    borderRadius: 8,
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    marginBottom: 7,
    gap: 5,
  },
  levelUpBannerText: {
    color: "#FBBF24",
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  topLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1B2538",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  expTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  expValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#38BDF8",
    letterSpacing: 0.1,
  },
  expUnit: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.4,
  },
  levelPill: {
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.28)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  levelPillText: {
    color: "#E0F2FE",
    fontSize: 11,
    fontWeight: "700",
  },
  detailBox: {
    backgroundColor: "rgba(0, 0, 0, 0.38)",
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginTop: 7,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  premiumLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  detailLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "500",
    flexShrink: 1,
  },
  premiumPercent: {
    color: "#38BDF8",
    fontSize: 10.5,
    fontWeight: "600",
  },
  detailValue: {
    color: "#F8FAFC",
    fontSize: 11.5,
    fontWeight: "700",
  },
  detailValueAccent: {
    color: "#38BDF8",
    fontSize: 11.5,
    fontWeight: "700",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  swipeHintText: {
    color: "#64748B",
    fontSize: 9.5,
    fontWeight: "500",
  },
  remainingXpText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "600",
  },
  progressBarTrack: {
    height: 3.5,
    backgroundColor: "#1E293B",
    borderRadius: 2,
    marginTop: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#38BDF8",
    borderRadius: 2,
  },
});
