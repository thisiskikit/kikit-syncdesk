import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MenuStateResponse } from "@shared/ui-state";
import { apiRequestJson, getJson } from "./queryClient";

type SetMenuState<TValue> =
  | TValue
  | ((current: TValue) => TValue);

export function useServerMenuState<TValue extends Record<string, unknown>>(
  key: string,
  initialValue: TValue,
) {
  const [state, setState] = useState<TValue>(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const lastSavedRef = useRef<string>(JSON.stringify(initialValue));

  const query = useQuery({
    queryKey: ["/api/ui-state", key],
    queryFn: () =>
      getJson<MenuStateResponse<TValue>>(`/api/ui-state?key=${encodeURIComponent(key)}`),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!query.isSuccess || isLoaded) {
      return;
    }

    const nextState = query.data.item?.value
      ? ({ ...initialValue, ...query.data.item.value } as TValue)
      : initialValue;

    lastSavedRef.current = JSON.stringify(nextState);
    setIsLoaded(true);
    setState(nextState);
  }, [initialValue, isLoaded, query.data, query.isSuccess]);

  useEffect(() => {
    if (!query.isError || isLoaded) {
      return;
    }

    setIsLoaded(true);
  }, [isLoaded, query.isError]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const serialized = JSON.stringify(state);
    if (serialized === lastSavedRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastSavedRef.current = serialized;
      void apiRequestJson<MenuStateResponse<TValue>>("PUT", "/api/ui-state", {
        key,
        value: state,
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isLoaded, key, state]);

  const updateState = useMemo(
    () => (updater: SetMenuState<TValue>) => {
      setState((current) =>
        typeof updater === "function"
          ? (updater as (value: TValue) => TValue)(current)
          : updater,
      );
    },
    [],
  );

  return {
    state,
    setState: updateState,
    isLoaded,
    isLoading: query.isLoading && !isLoaded,
    refetch: query.refetch,
  };
}
