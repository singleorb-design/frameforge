import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { createLocalStateStorage } from "@/services/local-api";
export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "dark",
            setTheme: (theme) => set({ theme }),
        }),
        { name: "frameforge:theme_store", storage: createJSONStorage(() => createLocalStateStorage("app")), skipHydration: true },
    ),
);
