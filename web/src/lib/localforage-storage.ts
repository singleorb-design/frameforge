import type { StateStorage } from "zustand/middleware";

import { createLocalStateStorage } from "@/services/local-api";

export const localForageStorage: StateStorage = createLocalStateStorage("settings");
