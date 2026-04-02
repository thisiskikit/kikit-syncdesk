import type { ChannelAdapter, ChannelCode } from "@shared/channel-control";
import { coupangAdapter } from "./coupang";
import { resetCoupangAdapterState } from "./coupang";
import { naverAdapter } from "./naver";
import { resetNaverAdapterState } from "./naver";

const registry: Record<ChannelCode, ChannelAdapter> = {
  naver: naverAdapter,
  coupang: coupangAdapter,
};

export function getChannelAdapter(channel: ChannelCode) {
  return registry[channel];
}

export function listChannelAdapters() {
  return Object.values(registry);
}

export function resetChannelAdapterStates() {
  resetNaverAdapterState();
  resetCoupangAdapterState();
}
