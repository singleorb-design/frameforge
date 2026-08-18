import { create } from "zustand";
import { getAppPreference, setAppPreference } from "@/services/app-preferences";

export const CANVAS_SIDE_PANEL_MOTION_MS = 500;
export const CANVAS_SIDE_PANEL_MIN_WIDTH = 220;
export const CANVAS_SIDE_PANEL_MAX_WIDTH = 480;
export const CANVAS_SIDE_PANEL_DEFAULT_WIDTH = 280;

const PREFERENCE_KEY = "canvas-side-panel";
let saveTimer: ReturnType<typeof setTimeout> | null = null;

type CanvasSidePanelStore = {
    width: number;
    panelOpen: boolean;
    panelMounted: boolean;
    panelClosing: boolean;
    setWidth: (width: number) => void;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
};

export const useCanvasSidePanelStore = create<CanvasSidePanelStore>((set, get) => ({
    width: CANVAS_SIDE_PANEL_DEFAULT_WIDTH,
    panelOpen: true,
    panelMounted: true,
    panelClosing: false,
    setWidth: (width) => {
        set({ width });
        scheduleSave();
    },
    openPanel: () => {
        set({ panelOpen: true, panelMounted: true, panelClosing: false });
        scheduleSave();
    },
    closePanel: () => {
        if (!get().panelMounted || get().panelClosing) return;
        set({ panelOpen: false, panelClosing: true });
        scheduleSave();
        setTimeout(() => {
            if (get().panelClosing) set({ panelMounted: false, panelClosing: false });
        }, CANVAS_SIDE_PANEL_MOTION_MS);
    },
    togglePanel: () => (get().panelOpen ? get().closePanel() : get().openPanel()),
}));

export async function hydrateCanvasSidePanelPreferences() {
    const saved = await getAppPreference(PREFERENCE_KEY, { width: CANVAS_SIDE_PANEL_DEFAULT_WIDTH, panelOpen: true });
    const width = Math.min(CANVAS_SIDE_PANEL_MAX_WIDTH, Math.max(CANVAS_SIDE_PANEL_MIN_WIDTH, Number(saved.width) || CANVAS_SIDE_PANEL_DEFAULT_WIDTH));
    useCanvasSidePanelStore.setState({ width, panelOpen: saved.panelOpen !== false, panelMounted: saved.panelOpen !== false, panelClosing: false });
}

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const { width, panelOpen } = useCanvasSidePanelStore.getState();
        void setAppPreference(PREFERENCE_KEY, { width, panelOpen });
    }, 300);
}
