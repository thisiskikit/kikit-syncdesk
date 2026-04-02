import type { MenuStateEntry } from "@shared/ui-state";

export interface UiStateStorePort {
  get<TValue extends Record<string, unknown>>(key: string): Promise<MenuStateEntry<TValue> | null>;
  set<TValue extends Record<string, unknown>>(
    key: string,
    value: TValue,
  ): Promise<MenuStateEntry<TValue>>;
}
