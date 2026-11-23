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
  background: "#FFF8FA",
  surface: "#FFFFFF",
  raised: "#FFEEF3",
  line: "rgba(225, 29, 72, 0.14)",
  text: "#1F0D15",
  muted: "#5C3A48",
  dim: "#946F7E",
  accent: "#E11D48",
  card: "#FFFFFF",
  cardBorder: "rgba(225, 29, 72, 0.16)",
};

export const darkColors = {
  background: "#0D080B",
  surface: "#180F15",
  raised: "#23161F",
  line: "rgba(251, 113, 133, 0.16)",
  text: "#FFF5F7",
  muted: "#C4A6B3",
  dim: "#7F6270",
  accent: "#F43F5E",
  card: "#191016",
  cardBorder: "rgba(251, 113, 133, 0.18)",
};
