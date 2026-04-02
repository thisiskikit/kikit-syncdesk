import bcrypt from "bcryptjs";
import type { ConnectionTestResult } from "@shared/channel-settings";
import { recordExternalRequestEvent } from "./logs/service";

const NAVER_TOKEN_URL =
  process.env.NAVER_COMMERCE_AUTH_URL ||
  "https://api.commerce.naver.com/external/v1/oauth2/token";

type NaverAccessTokenPayload = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

function isHtmlPayload(text: string, contentType: string | null) {
  const normalized = text.trim().toLowerCase();

  return (
    (contentType || "").toLowerCase().includes("text/html") ||
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.startsWith("<body")
  );
}

function parseNaverPayload(response: Response, text: string, context: string) {
  if (!text) {
    return null;
  }

  if (isHtmlPayload(text, response.headers.get("content-type"))) {
    throw new Error(
      `Expected JSON from NAVER ${context}, but received HTML. Check NAVER_COMMERCE_AUTH_URL and your NAVER Commerce API credentials.`,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function buildClientSecretSign(input: { clientId: string; clientSecret: string; timestamp: string }) {
  const password = `${input.clientId}_${input.timestamp}`;
  const encrypted = bcrypt.hashSync(password, input.clientSecret);
  return Buffer.from(encrypted, "utf-8").toString("base64");
}

function extractErrorMessage(payload: unknown, fallbackStatus: number) {
  if (!payload || typeof payload !== "object") {
    return `Naver token request failed (${fallbackStatus}).`;
  }

  const message =
    ("message" in payload && typeof payload.message === "string" && payload.message) ||
    ("error_description" in payload &&
      typeof payload.error_description === "string" &&
      payload.error_description) ||
    ("error" in payload && typeof payload.error === "string" && payload.error) ||
    null;

  return message || `Naver token request failed (${fallbackStatus}).`;
}

async function requestNaverToken(input: { clientId: string; clientSecret: string }) {
  const startedAt = Date.now();
  let response: Response | null = null;
  const timestamp = Date.now().toString();
  const clientSecretSign = buildClientSecretSign({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    timestamp,
  });

  try {
    response = await fetch(NAVER_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: input.clientId,
        timestamp,
        client_secret_sign: clientSecretSign,
        grant_type: "client_credentials",
        type: "SELF",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const text = await response.text();
    const payload = parseNaverPayload(response, text, "token API");

    void recordExternalRequestEvent({
      provider: "naver",
      method: "POST",
      path: "/external/v1/oauth2/token",
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
    });

    return { response, payload };
  } catch (error) {
    void recordExternalRequestEvent({
      provider: "naver",
      method: "POST",
      path: "/external/v1/oauth2/token",
      statusCode: response?.status ?? null,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}

export async function issueNaverAccessToken(input: {
  clientId: string;
  clientSecret: string;
}) {
  const { response, payload } = await requestNaverToken(input);

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, response.status));
  }

  const tokenPayload = (payload ?? {}) as NaverAccessTokenPayload;

  if (!tokenPayload.access_token) {
    throw new Error("Naver token response did not include access_token.");
  }

  return {
    accessToken: tokenPayload.access_token,
    expiresIn: tokenPayload.expires_in ?? null,
    tokenType: tokenPayload.token_type ?? "Bearer",
  };
}

export async function testNaverConnection(input: {
  clientId: string;
  clientSecret: string;
}): Promise<ConnectionTestResult> {
  const testedAt = new Date().toISOString();

  try {
    await issueNaverAccessToken(input);
    return {
      status: "success",
      testedAt,
      message: "Token issued successfully.",
    };
  } catch (error) {
    return {
      status: "failed",
      testedAt,
      message:
        error instanceof Error ? error.message : "Unexpected error during Naver token request.",
    };
  }
}
