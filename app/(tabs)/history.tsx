import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LibraryView } from "@/components/library-view";

export default function HistoryTab() {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      <LibraryView
        variant="tab"
        initialTab="history"
        allowedTabs={["history"]}
        showTopBar={true}
        headerTitle="Jejak Tontonan"
        headerSubtitle="Lanjutkan episode terakhir yang kamu putar"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121316",
  },
});
