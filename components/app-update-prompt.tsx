import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import { AppIcon } from "@/components/app-icon";
import {
  checkForLuckynimeUpdate,
  getDeviceAbi,
  isReleaseNewer,
  LUCKYNIME_GITHUB_RELEASE_PAGE_URL,
  updateDismissalKey,
  abiLabel,
  ABI_PRIORITY,
  type AppRelease,
  type ApkAbi,
  type ApkAsset,
} from "@/lib/app-update";
import {
  downloadAndInstallApk,
  type DownloadProgress,
} from "@/lib/android-app-installer";
import { supabase } from "@/lib/supabase";

// ── Constants ────────────────────────────────────────────────────────────────

const installedVersion =
  Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "0.0.1";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return mb < 100 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

interface ChangelogItem {
  title?: string;
  desc: string;
}

function parseChangelog(body?: string): ChangelogItem[] {
  if (!body) return [];
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.match(/^<!--/))
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  const items: ChangelogItem[] = [];

  for (const line of lines) {
    const match = line.match(/^\*\*(.*?)\*\*[:\s-]*(.*)$/);
    if (match) {
      items.push({
        title: match[1].trim(),
        desc: match[2].trim(),
      });
    } else {
      const cleaned = line.replace(/\*\*/g, "").trim();
      if (cleaned) {
        items.push({ desc: cleaned });
      }
    }
  }

  return items.slice(0, 10);
}

// ── Download state ────────────────────────────────────────────────────────────

type Phase =
  | "idle"
  | "checking-permission"
  | "downloading"
  | "installing"
  | "rechecking"
  | "error";

// ── Component ────────────────────────────────────────────────────────────────

export function AppUpdatePrompt() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  // ABI selection
  const [deviceAbi, setDeviceAbi] = useState<ApkAbi | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<ApkAsset | null>(null);
  const [showAbiMenu, setShowAbiMenu] = useState(false);

  const busyRef = useRef(false);

  // ── Fetch device ABI once ──
  useEffect(() => {
    getDeviceAbi().then((abi) => setDeviceAbi(abi));
  }, []);

  // ── Compute recommended asset whenever release / deviceAbi changes ──
  useEffect(() => {
    if (!release) return;
    const assets = release.assets;
    if (assets.length === 0) return;
    const recommended =
      (deviceAbi ? assets.find((a) => a.abi === deviceAbi) : null) ??
      assets.find((a) => a.abi === "universal") ??
      assets[0];
    setSelectedAsset(recommended ?? null);
  }, [release, deviceAbi]);

  // ── Update check against GitHub Release (and mirror/Supabase fallback) ──
  const check = useCallback(async (force = false) => {
    try {
      const result = await checkForLuckynimeUpdate(installedVersion, { force });
      if (!result.available || !result.release) {
        setRelease(null);
        return;
      }

      // Whenever installed version is older than the latest GitHub Release,
      // enforce mandatory update without allowing dismissal bypass.
      const mustForceUpdate =
        isReleaseNewer(installedVersion, result.release.version) ||
        Boolean(result.release.mandatory);

      if (mustForceUpdate) {
        setRelease({ ...result.release, mandatory: true });
        return;
      }

      const dismissed = await AsyncStorage.getItem(
        updateDismissalKey(result.release.version)
      ).catch(() => null);
      if (!dismissed) {
        setRelease(result.release);
      }
    } catch {}
  }, []);

  useEffect(() => {
    void check(true);

    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void check(true);
    });

    // Also subscribe to realtime Supabase `system_configs` (`app_release`) updates
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const chName = `realtime-app-release-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      channel = supabase
        .channel(chName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "system_configs",
            filter: "key=eq.app_release",
          },
          () => {
            void check(true);
          }
        )
        .subscribe();
    } catch {}

    return () => {
      sub.remove();
      if (channel) {
        try {
          supabase.removeChannel(channel).catch(() => {});
        } catch {}
      }
    };
  }, [check]);

  const isForceUpdate = Boolean(
    release &&
      (release.mandatory !== false ||
        isReleaseNewer(installedVersion, release.version))
  );

  // ── Actions ──
  const dismiss = useCallback(async () => {
    // Block dismissal completely when outdated / mandatory
    if (busyRef.current || isForceUpdate) return;
    if (release) {
      await AsyncStorage.setItem(
        updateDismissalKey(release.version),
        "1"
      ).catch(() => {});
    }
    setRelease(null);
    setPhase("idle");
    setProgress(null);
    setErrorMsg(null);
    setShowAbiMenu(false);
  }, [isForceUpdate, release]);

  const isAndroid = Platform.OS === "android";
  const isDownloading = phase === "downloading";
  const isInstalling = phase === "installing";
  const isRechecking = phase === "rechecking";
  const isBusy = isDownloading || isInstalling || isRechecking;

  const openGitHubReleasePage = useCallback(() => {
    const targetUrl =
      release?.releaseUrl ||
      selectedAsset?.downloadUrl ||
      LUCKYNIME_GITHUB_RELEASE_PAGE_URL;
    void Linking.openURL(targetUrl).catch(() => {});
  }, [release, selectedAsset]);

  const handleUpdate = useCallback(async () => {
    if (!release || busyRef.current) return;

    if (isAndroid && selectedAsset && selectedAsset.size > 0) {
      busyRef.current = true;
      setPhase("downloading");
      setProgress(null);
      setErrorMsg(null);
      try {
        await downloadAndInstallApk(selectedAsset, (p) => {
          setProgress(p);
        });
        setPhase("installing");
      } catch (e) {
        setErrorMsg(
          e instanceof Error
            ? `${e.message} Kamu juga bisa mengunduh langsung lewat tombol GitHub Release di bawah.`
            : "Gagal mengunduh otomatis. Silakan unduh melalui tombol GitHub Release di bawah."
        );
        setPhase("error");
      } finally {
        busyRef.current = false;
      }
      return;
    }

    // Fallback or non-sized asset: open direct APK or GitHub Release page
    const targetUrl =
      selectedAsset?.downloadUrl ||
      release.downloadUrl ||
      release.releaseUrl ||
      LUCKYNIME_GITHUB_RELEASE_PAGE_URL;

    if (targetUrl) {
      void Linking.openURL(targetUrl).catch(() => {});
    }
  }, [release, selectedAsset, isAndroid]);

  const handleRecheck = useCallback(async () => {
    if (busyRef.current) return;
    setPhase("rechecking");
    setErrorMsg(null);
    try {
      await check(true);
    } finally {
      setPhase("idle");
    }
  }, [check]);

  const changelog = useMemo(
    () => parseChangelog(release?.body),
    [release?.body]
  );

  const progressFraction = progress?.fraction ?? 0;
  const progressPct = Math.round(progressFraction * 100);
  const progressLabel = isInstalling
    ? "Membuka paket instalasi Android..."
    : isDownloading && progress
    ? `Mengunduh APK... ${progressPct}%${
        progress.totalBytes > 0
          ? ` (${formatBytes(progress.bytesWritten)} / ${formatBytes(
              progress.totalBytes
            )})`
          : ""
      }`
    : null;

  // ── Sorted asset list for ABI menu ──
  const sortedAssets = useMemo(() => {
    if (!release) return [];
    return [...release.assets].sort((a, b) => {
      const ai = a.abi ? ABI_PRIORITY.indexOf(a.abi) : 99;
      const bi = b.abi ? ABI_PRIORITY.indexOf(b.abi) : 99;
      return ai - bi;
    });
  }, [release]);

  if (!release) return null;

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!isForceUpdate) {
          void dismiss();
        }
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          {/* Close Button ONLY if optional (hidden when version is outdated) */}
          {!isBusy && !isForceUpdate && (
            <Pressable
              onPress={() => void dismiss()}
              accessibilityRole="button"
              accessibilityLabel="Tutup"
              hitSlop={12}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.btnPressedSubtle,
              ]}
            >
              <AppIcon name="close" size={15} color="#94A3B8" />
            </Pressable>
          )}

          {/* ── Header ── */}
          <View style={[styles.header, isForceUpdate && { paddingRight: 0 }]}>
            <View style={styles.updateBadge}>
              <View style={styles.updateDot} />
              <Text style={styles.updateBadgeText}>
                {isForceUpdate
                  ? "PEMBARUAN WAJIB • GITHUB RELEASE"
                  : "PEMBARUAN TERSEDIA"}
              </Text>
            </View>

            <View style={styles.versionRow}>
              <Text style={styles.versionText}>Versi {release.version}</Text>
              <View style={styles.versionCompareBadge}>
                <Text style={styles.versionCompareText}>
                  v{installedVersion} ➔ v{release.version}
                </Text>
              </View>
            </View>

            <Text style={styles.subtitle}>
              Versi aplikasi kamu (v{installedVersion}) sudah lama. Perbarui terlebih dahulu ke v{release.version} melalui rilis resmi GitHub Release untuk melanjutkan menggunakan Luckynime.
            </Text>
          </View>

          {/* ── Changelog Card List ── */}
          {changelog.length > 0 && (
            <View style={styles.changelogSection}>
              <View style={styles.sectionHeaderRow}>
                <AppIcon name="format-list-bulleted" size={14} color="#38BDF8" />
                <Text style={styles.sectionLabel}>CATATAN PEMBARUAN</Text>
              </View>

              <ScrollView
                style={styles.changelogScroll}
                contentContainerStyle={styles.changelogContentContainer}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {changelog.map((item, i) => (
                  <View key={i} style={styles.changelogCard}>
                    <View style={styles.changelogBullet} />
                    <View style={styles.changelogTextWrap}>
                      {item.title ? (
                        <Text style={styles.changelogItemTitle}>{item.title}</Text>
                      ) : null}
                      <Text style={styles.changelogItemDesc}>{item.desc}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── Mandatory notice ── */}
          {isForceUpdate && (
            <View style={styles.mandatoryRow}>
              <AppIcon name="alert-circle-outline" size={15} color="#F43F5E" />
              <Text style={styles.mandatoryText}>
                Versi lama tidak dapat digunakan lagi. Silakan unduh & pasang versi terbaru dari GitHub Release.
              </Text>
            </View>
          )}

          {/* ── ABI Selector (Multi-asset) ── */}
          {sortedAssets.length > 1 && !isBusy && (
            <View style={styles.abiContainer}>
              <Text style={styles.sectionLabel}>ARSITEKTUR PERANGKAT</Text>
              <Pressable
                onPress={() => setShowAbiMenu((v) => !v)}
                style={({ pressed }) => [
                  styles.abiSelector,
                  pressed && styles.btnPressedSubtle,
                ]}
                accessibilityRole="button"
              >
                <View style={styles.abiSelectorLeft}>
                  <View style={styles.abiIconBadge}>
                    <AppIcon name="android" size={15} color="#38BDF8" />
                  </View>
                  <View>
                    <Text style={styles.abiSelectorValue}>
                      {selectedAsset
                        ? abiLabel(selectedAsset.abi)
                        : "Pilih arsitektur"}
                    </Text>
                    {selectedAsset && selectedAsset.size > 0 ? (
                      <Text style={styles.abiSelectorSize}>
                        Ukuran: {formatBytes(selectedAsset.size)}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <AppIcon
                  name={showAbiMenu ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#94A3B8"
                />
              </Pressable>

              {showAbiMenu && (
                <View style={styles.abiMenu}>
                  {sortedAssets.map((asset) => {
                    const isSelected = asset.name === selectedAsset?.name;
                    const isRecommended = deviceAbi
                      ? asset.abi === deviceAbi
                      : asset.abi === "universal";
                    return (
                      <Pressable
                        key={asset.name}
                        onPress={() => {
                          setSelectedAsset(asset);
                          setShowAbiMenu(false);
                        }}
                        style={({ pressed }) => [
                          styles.abiMenuItem,
                          isSelected && styles.abiMenuItemSelected,
                          pressed && styles.btnPressedSubtle,
                        ]}
                        accessibilityRole="menuitem"
                      >
                        <View style={styles.abiMenuItemLeft}>
                          <Text
                            style={[
                              styles.abiMenuItemText,
                              isSelected && styles.abiMenuItemTextSelected,
                            ]}
                          >
                            {abiLabel(asset.abi)}
                          </Text>
                          {isRecommended && (
                            <View style={styles.recommendedBadge}>
                              <Text style={styles.recommendedText}>
                                REKOMENDASI
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.abiMenuItemRight}>
                          {asset.size > 0 ? (
                            <Text style={styles.abiMenuItemSize}>
                              {formatBytes(asset.size)}
                            </Text>
                          ) : null}
                          {isSelected && (
                            <AppIcon name="check" size={14} color="#10B981" />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ── Progress bar ── */}
          {isBusy && (
            <View style={styles.progressSection}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: isInstalling
                        ? "100%"
                        : `${Math.max(progressFraction * 100, 4)}%`,
                    },
                  ]}
                />
              </View>
              {progressLabel && (
                <Text style={styles.progressLabel}>{progressLabel}</Text>
              )}
            </View>
          )}

          {/* ── Error ── */}
          {phase === "error" && errorMsg && (
            <View style={styles.errorRow}>
              <AppIcon name="alert-circle-outline" size={15} color="#F43F5E" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* ── Actions ── */}
          <View style={styles.actionsColumn}>
            <Pressable
              disabled={isBusy}
              onPress={() => void handleUpdate()}
              style={({ pressed }) => [
                styles.primaryBtn,
                isBusy && styles.btnDisabled,
                pressed && !isBusy && styles.btnPressed,
              ]}
              accessibilityRole="button"
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.btnRow}>
                  <AppIcon name="download" size={17} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>
                    {phase === "error"
                      ? "Coba Unduh Lagi"
                      : isAndroid
                      ? `Unduh & Pasang v${release.version}`
                      : `Unduh APK v${release.version}`}
                  </Text>
                </View>
              )}
            </Pressable>

            <View style={styles.secondaryRow}>
              <Pressable
                disabled={isBusy}
                onPress={openGitHubReleasePage}
                style={({ pressed }) => [
                  styles.githubBtn,
                  pressed && !isBusy && styles.btnPressedSubtle,
                ]}
                accessibilityRole="button"
              >
                <AppIcon name="github" size={15} color="#E2E8F0" />
                <Text style={styles.githubBtnText}>Buka GitHub Release</Text>
              </Pressable>

              {isForceUpdate ? (
                <Pressable
                  disabled={isBusy}
                  onPress={() => void handleRecheck()}
                  style={({ pressed }) => [
                    styles.recheckBtn,
                    pressed && !isBusy && styles.btnPressedSubtle,
                  ]}
                  accessibilityRole="button"
                >
                  <AppIcon name="refresh" size={14} color="#94A3B8" />
                  <Text style={styles.laterBtnText}>Cek Ulang</Text>
                </Pressable>
              ) : (
                !isBusy && (
                  <Pressable
                    onPress={() => void dismiss()}
                    style={({ pressed }) => [
                      styles.recheckBtn,
                      pressed && styles.btnPressedSubtle,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.laterBtnText}>Nanti</Text>
                  </Pressable>
                )
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.84)",
    padding: 16,
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    backgroundColor: "#0F131C",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 20,
    gap: 13,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 24,
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  // Header
  header: {
    gap: 6,
    paddingRight: 28,
  },
  updateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(244, 63, 94, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.34)",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
  },
  updateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F43F5E",
  },
  updateBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#FB7185",
    letterSpacing: 0.7,
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
    flexWrap: "wrap",
  },
  versionText: {
    fontSize: 21,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  versionCompareBadge: {
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.28)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  versionCompareText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#38BDF8",
  },
  subtitle: {
    fontSize: 12,
    color: "#94A3B8",
    lineHeight: 17,
    marginTop: 1,
  },

  // Section
  changelogSection: {
    gap: 7,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.8,
  },
  changelogScroll: {
    maxHeight: 150,
  },
  changelogContentContainer: {
    gap: 6,
  },
  changelogCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  changelogBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#38BDF8",
    marginTop: 5,
    flexShrink: 0,
  },
  changelogTextWrap: {
    flex: 1,
    gap: 2,
  },
  changelogItemTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#F1F5F9",
    lineHeight: 16,
  },
  changelogItemDesc: {
    fontSize: 11.5,
    color: "#94A3B8",
    lineHeight: 16,
  },

  // Mandatory
  mandatoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(244, 63, 94, 0.09)",
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.25)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mandatoryText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#FDA4AF",
    flex: 1,
    lineHeight: 16,
  },

  // ABI Selector
  abiContainer: {
    gap: 6,
  },
  abiSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  abiSelectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  abiIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  abiSelectorValue: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  abiSelectorSize: {
    fontSize: 10.5,
    color: "#64748B",
    marginTop: 1,
  },
  abiMenu: {
    marginTop: 4,
    backgroundColor: "#141A26",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 12,
    overflow: "hidden",
  },
  abiMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  abiMenuItemSelected: {
    backgroundColor: "rgba(56, 189, 248, 0.08)",
  },
  abiMenuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  abiMenuItemText: {
    fontSize: 12.5,
    color: "#94A3B8",
  },
  abiMenuItemTextSelected: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  abiMenuItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  abiMenuItemSize: {
    fontSize: 11,
    color: "#64748B",
  },
  recommendedBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recommendedText: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#34D399",
    letterSpacing: 0.5,
  },

  // Progress
  progressSection: {
    gap: 7,
  },
  progressTrack: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    backgroundColor: "#0284C7",
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center",
  },

  // Error
  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(244, 63, 94, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.22)",
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    fontSize: 11.5,
    color: "#FDA4AF",
    flex: 1,
    lineHeight: 16,
  },

  // Actions
  actionsColumn: {
    gap: 8,
    marginTop: 2,
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtn: {
    width: "100%",
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0284C7",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.45)",
    borderRadius: 14,
  },
  primaryBtnText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  githubBtn: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 10,
  },
  githubBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E2E8F0",
  },
  recheckBtn: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    paddingHorizontal: 12,
  },
  laterBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
  },

  btnDisabled: {
    opacity: 0.55,
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  btnPressedSubtle: {
    opacity: 0.72,
  },
});
