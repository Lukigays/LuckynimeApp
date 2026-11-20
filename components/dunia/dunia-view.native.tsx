import React, { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

export function DuniaView({
  url,
  onLoadProgress,
  onLoadEnd,
  onError,
  onMessage,
}: {
  url: string;
  onLoadProgress?: (progress: number) => void;
  onLoadEnd?: () => void;
  onError?: (err: any) => void;
  onMessage?: (data: any) => void;
}) {
  const webViewRef = useRef<WebView>(null);

  // Origin resmi Dunia Luckynime. Navigasi utama (main-frame) ke domain lain
  // diblokir agar pengguna tidak terseret keluar ke pengalaman ala-browser;
  // pemuatan subresource (skrip/gambar/font dari CDN) tetap diizinkan agar
  // aplikasi web Dunia tidak rusak.
  let allowedOrigin = "";
  try {
    allowedOrigin = new URL(url).origin;
  } catch {
    allowedOrigin = "";
  }

  const handleShouldStartLoad = (request: {
    url: string;
    mainFrame?: boolean;
    isForMainFrame?: boolean;
  }) => {
    const target = request.url || "";
    if (!target || target === "about:blank") return true;

    let targetOrigin = "";
    try {
      targetOrigin = new URL(target).origin;
    } catch {
      return false;
    }

    // Same-origin dengan Dunia Luckynime selalu diizinkan.
    if (allowedOrigin && targetOrigin === allowedOrigin) return true;

    // Bukan navigasi frame utama (aset/subresource) → izinkan agar CDN tetap jalan.
    const isMainFrame = request.mainFrame ?? request.isForMainFrame ?? true;
    if (!isMainFrame) return true;

    // Navigasi utama ke domain luar → blokir (tetap di dalam aplikasi).
    return false;
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={false}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        androidLayerType="hardware"
        mixedContentMode="always"
        overScrollMode="never"
        renderToHardwareTextureAndroid={true}
        nestedScrollEnabled={false}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onLoadProgress={({ nativeEvent }) => {
          onLoadProgress?.(nativeEvent.progress);
        }}
        onLoadEnd={() => {
          onLoadEnd?.();
        }}
        onError={(syntheticEvent) => {
          onError?.(syntheticEvent.nativeEvent);
        }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            onMessage?.(data);
          } catch {
            onMessage?.(event.nativeEvent.data);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1115",
  },
  webView: {
    flex: 1,
    backgroundColor: "#0F1115",
  },
});
