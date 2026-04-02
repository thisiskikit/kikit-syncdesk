import type { UiStateStorePort } from "../interfaces/ui-state-store";
import { UiStateStore, fileUiStateStore } from "../stores/file-ui-state-store";

export type { UiStateStorePort } from "../interfaces/ui-state-store";
export { UiStateStore };

export const uiStateStore: UiStateStorePort = fileUiStateStore;
