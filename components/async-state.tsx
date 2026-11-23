import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { AppIcon } from "@/components/app-icon";
import { ChibiLoading } from "@/components/chibi-loading";

const EMPTY_ILLUSTRATION = require("@/assets/images/empty-state.png");

export function LoadingState({
  label = "Menyiapkan katalog anime...",
  style,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.loadingContainer, style]}>
      <ChibiLoading size={76} />
      {label ? <Text style={styles.loadingText}>{label}</Text> : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "COBA LAGI",
  retryDisabled = false,
  style,
}: {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
  retryDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const anilistOutage = /AniList is temporarily unavailable due to an upstream stability issue/i.test(message);
  const friendlyMessage = /api\.luckynime|backend|graphql|network request|failed to fetch/i.test(message)
    ? "Periksa koneksi internet dan coba lagi."
    : message;

  return (
    <View accessibilityRole="alert" style={[styles.stateContainer, style]}>
      <View style={[styles.iconCard, styles.errorIconCard]}>
        <AppIcon name="alert-circle-outline" size={28} color="#FFFFFF" />
      </View>
      <Text style={styles.stateTitle}>
        {anilistOutage ? "Layanan AniList Sedang Sibuk" : "Gagal Memuat Data"}
      </Text>
      <Text style={styles.stateDesc}>
        {anilistOutage
          ? "AniList sedang mengalami lonjakan trafik. Silakan coba sesaat lagi."
          : friendlyMessage}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={retryDisabled}
        onPress={onRetry}
        style={({ pressed }) => [
          styles.actionBtn,
          retryDisabled && styles.btnDisabled,
          pressed && styles.btnPressed,
        ]}
      >
        <Text style={styles.actionBtnText}>{retryLabel}</Text>
      </Pressable>
    </View>
  );
}

export function EmptyState({
  label,
  action,
  imageSource,
  imageSize = 140,
  style,
}: {
  label: string;
  action?: { label: string; onPress: () => void };
  imageSource?: any;
  imageSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.stateContainer, style]}>
      <Image
        source={imageSource ?? EMPTY_ILLUSTRATION}
        style={[styles.emptyIllustration, { width: imageSize, height: imageSize }]}
        contentFit="contain"
      />
      <Text style={styles.stateDesc}>{label}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}
        >
          <Text style={styles.actionBtnText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    minHeight: 280,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    gap: 14,
  },
  loadingText: {
    fontFamily: "Nunito-Bold",
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 18,
  },
  stateContainer: {
    flex: 1,
    minHeight: 300,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 40,
    gap: 12,
  },
  iconCard: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  errorIconCard: {
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderColor: "rgba(255, 255, 255, 0.34)",
  },
  emptyIllustration: {
    marginBottom: 4,
    opacity: 0.92,
  },
  stateTitle: {
    fontFamily: "Nunito-Bold",
    fontSize: 17,
    color: "#F3F4F6",
    textAlign: "center",
  },
  stateDesc: {
    fontFamily: "Nunito-SemiBold",
    fontSize: 13.5,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
  actionBtn: {
    marginTop: 6,
    minHeight: 42,
    paddingHorizontal: 22,
    borderRadius: 99,
    backgroundColor: "#EF4444",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    fontFamily: "Nunito-Bold",
    fontSize: 12,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.975 }],
  },
});
