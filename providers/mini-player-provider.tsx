import React, { createContext, useContext, useState, useCallback, useMemo, useRef, type PropsWithChildren } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

export type MiniPlayerData = {
  animeId: number;
  episode: number;
  animeTitle: string;
  episodeTitle: string;
  thumbnail: string;
  videoSourceUri: string;
  videoSourceHeaders?: Record<string, string>;
  videoContentType?: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  cachedStream?: any;
  cachedSource?: any;
  cachedProvider?: any;
  cachedProviders?: any;
  cachedServerIndex?: number;
  cachedQuality?: any;
  cachedLanguage?: any;
};

export type MiniPlayerContextValue = {
  playerData: MiniPlayerData | null;
  isMinimized: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  getCurrentTime: () => number;
  minimizePlayer: (data: MiniPlayerData) => void;
  restorePlayer: () => void;
  closeMiniPlayer: () => void;
  togglePlayPause: () => void;
  setIsPlaying: (playing: boolean) => void;
  updatePlaybackTime: (time: number, duration?: number) => void;
};

const MiniPlayerContext = createContext<MiniPlayerContextValue | null>(null);

function saveLocalProgressSnapshot(animeId?: number, episode?: number, progress?: number, duration?: number) {
  if (!animeId || animeId <= 0 || !episode || episode <= 0) return;
  if (typeof progress !== "number" || !Number.isFinite(progress) || progress < 3) return;
  const total = typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : 0;
  void AsyncStorage.setItem(
    `luckynime-watch-local:${animeId}:${episode}`,
    JSON.stringify({ progress, duration: total, savedAt: Date.now() }),
  ).catch(() => {});
}

export function MiniPlayerProvider({ children }: PropsWithChildren) {
  const [playerData, setPlayerData] = useState<MiniPlayerData | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const currentTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const playerDataRef = useRef<MiniPlayerData | null>(null);
  const lastSavedAtRef = useRef<number>(0);

  const minimizePlayer = useCallback((data: MiniPlayerData) => {
    playerDataRef.current = data;
    setPlayerData(data);
    currentTimeRef.current = data.currentTime;
    durationRef.current = data.duration || 0;
    saveLocalProgressSnapshot(data.animeId, data.episode, data.currentTime, data.duration);
    setIsPlaying(data.isPlaying);
    setIsMinimized(true);
  }, []);

  const closeMiniPlayer = useCallback(() => {
    const active = playerDataRef.current;
    if (active) {
      saveLocalProgressSnapshot(active.animeId, active.episode, currentTimeRef.current, durationRef.current || active.duration);
    }
    setIsMinimized(false);
    setIsPlaying(false);
    playerDataRef.current = null;
    setPlayerData(null);
    currentTimeRef.current = 0;
    durationRef.current = 0;
  }, []);

  const restorePlayer = useCallback(() => {
    const active = playerDataRef.current || playerData;
    if (!active) return;
    const latestTime = currentTimeRef.current > 0 ? currentTimeRef.current : active.currentTime;
    const latestDur = durationRef.current > 0 ? durationRef.current : active.duration;
    saveLocalProgressSnapshot(active.animeId, active.episode, latestTime, latestDur);
    const updated = { ...active, currentTime: latestTime, duration: latestDur };
    playerDataRef.current = updated;
    setPlayerData(updated);
    setIsMinimized(false);
    router.push({
      pathname: "/watch/[id]",
      params: {
        id: String(active.animeId),
        episode: String(active.episode),
        title: active.animeTitle,
        image: active.thumbnail,
        resumeTime: String(Math.floor(latestTime)),
        fromMini: "1",
      },
    } as never);
  }, [playerData]);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const updatePlaybackTime = useCallback((time: number, dur?: number) => {
    if (Number.isFinite(time)) {
      currentTimeRef.current = time;
    }
    if (dur && Number.isFinite(dur) && dur > 0) {
      durationRef.current = dur;
    }
    const now = Date.now();
    const active = playerDataRef.current;
    if (active && now - lastSavedAtRef.current >= 3000) {
      lastSavedAtRef.current = now;
      saveLocalProgressSnapshot(active.animeId, active.episode, currentTimeRef.current, durationRef.current || active.duration);
    }
  }, []);

  const getCurrentTime = useCallback(() => currentTimeRef.current, []);

  const value = useMemo<MiniPlayerContextValue>(
    () => ({
      playerData,
      isMinimized,
      isPlaying,
      currentTime: currentTimeRef.current,
      duration: durationRef.current,
      getCurrentTime,
      minimizePlayer,
      restorePlayer,
      closeMiniPlayer,
      togglePlayPause,
      setIsPlaying,
      updatePlaybackTime,
    }),
    [
      playerData,
      isMinimized,
      isPlaying,
      getCurrentTime,
      minimizePlayer,
      restorePlayer,
      closeMiniPlayer,
      togglePlayPause,
      updatePlaybackTime,
    ]
  );

  return <MiniPlayerContext.Provider value={value}>{children}</MiniPlayerContext.Provider>;
}

export function useMiniPlayer(): MiniPlayerContextValue {
  const ctx = useContext(MiniPlayerContext);
  if (!ctx) {
    throw new Error("useMiniPlayer must be used within a MiniPlayerProvider");
  }
  return ctx;
}
