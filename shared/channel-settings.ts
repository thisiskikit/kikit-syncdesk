import { z } from "zod";
import { channelCodes } from "./channel-control";

export const settingsEnabledChannels = ["naver"] as const;
export type SettingsEnabledChannel = (typeof settingsEnabledChannels)[number];

export const connectionTestStatuses = ["idle", "success", "failed"] as const;
export type ConnectionTestStatus = (typeof connectionTestStatuses)[number];

export const channelStoreSummarySchema = z.object({
  id: z.string().uuid(),
  channel: z.enum(channelCodes),
  storeName: z.string(),
  credentials: z.object({
    clientId: z.string(),
    hasClientSecret: z.boolean(),
    clientSecretMasked: z.string().nullable(),
  }),
  connectionTest: z.object({
    status: z.enum(connectionTestStatuses),
    testedAt: z.string().nullable(),
    message: z.string().nullable(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ChannelStoreSummary = z.infer<typeof channelStoreSummarySchema>;

export const upsertChannelStoreInputSchema = z.object({
  id: z.string().uuid().optional(),
  channel: z.enum(settingsEnabledChannels),
  storeName: z.string().trim().min(1).max(120),
  credentials: z.object({
    clientId: z.string().trim().min(1).max(200),
    clientSecret: z.string().trim().max(200).optional(),
  }),
});

export type UpsertChannelStoreInput = z.infer<typeof upsertChannelStoreInputSchema>;

export const testChannelConnectionInputSchema = z.object({
  storeId: z.string().uuid().optional(),
  channel: z.enum(settingsEnabledChannels),
  credentials: z.object({
    clientId: z.string().trim().min(1).max(200),
    clientSecret: z.string().trim().max(200).optional(),
  }),
});

export type TestChannelConnectionInput = z.infer<typeof testChannelConnectionInputSchema>;

export const connectionTestResultSchema = z.object({
  status: z.enum(connectionTestStatuses),
  testedAt: z.string(),
  message: z.string(),
});

export type ConnectionTestResult = z.infer<typeof connectionTestResultSchema>;
