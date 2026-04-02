import type { Response } from "express";
import { sendError } from "../../services/shared/api-response";

type MessageBasedErrorOptions = {
  invalidPatterns: string[];
  invalidCode: string;
  apiFailedCode: string;
  fallbackMessage: string;
  invalidStatus?: number;
  apiFailedStatus?: number;
};

function matchesPattern(message: string, patterns: string[]) {
  return patterns.some((pattern) => message.includes(pattern));
}

export function resolveMessageBasedError(
  message: string,
  options: MessageBasedErrorOptions,
) {
  const isInvalid = matchesPattern(message, options.invalidPatterns);

  return {
    status: isInvalid ? options.invalidStatus ?? 400 : options.apiFailedStatus ?? 502,
    code: isInvalid ? options.invalidCode : options.apiFailedCode,
  };
}

export function sendMessageBasedError(
  res: Response,
  error: unknown,
  options: MessageBasedErrorOptions,
) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : options.fallbackMessage;
  const resolved = resolveMessageBasedError(message, options);

  sendError(res, resolved.status, {
    code: resolved.code,
    message,
  });
}
