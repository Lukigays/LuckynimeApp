import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";

export type ThemeMode = "dark" | "light" | "system";

type ThemeContextType = {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
};

const STORAGE_KEY = "luckynime.theme.v2";

const ThemeContext = createContext<ThemeContextType>({
  mode: "dark",
  isDark: true,
  setMode: () => {},
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") {
          setModeState(stored);
        }
      })
      .catch(() => {});
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const isDark = mode === "system" ? systemScheme !== "light" : mode === "dark";

  return (
    <ThemeContext.Provider value={{ mode, isDark, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const AppThemeProvider = ThemeProvider;

export function useTheme() {
  return useContext(ThemeContext);
}

export const lightColors = {
  background: "#F5F6F8",
  surface: "#FFFFFF",
  raised: "#EBEEF3",
  line: "rgba(18, 19, 22, 0.08)",
  text: "#121316",
  muted: "#5B606E",
  dim: "#8E93A2",
  accent: "#121316",
  card: "#FFFFFF",
  cardBorder: "rgba(18, 19, 22, 0.08)",
};

export const darkColors = {
  background: "#121316",
  surface: "#1B1D22",
  raised: "#23262F",
  line: "rgba(255, 255, 255, 0.08)",
  text: "#F3F4F6",
  muted: "#9CA3AF",
  dim: "#6B7280",
  accent: "#FFFFFF",
  card: "#1B1D22",
  cardBorder: "rgba(255, 255, 255, 0.08)",
};
