export interface MenuStateEntry<TValue extends Record<string, unknown> = Record<string, unknown>> {
  key: string;
  value: TValue;
  createdAt: string;
  updatedAt: string;
}

export interface MenuStateResponse<TValue extends Record<string, unknown> = Record<string, unknown>> {
  item: MenuStateEntry<TValue> | null;
}
