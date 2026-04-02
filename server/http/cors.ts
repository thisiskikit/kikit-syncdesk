import type { NextFunction, Request, Response } from "express";

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function readAllowedCorsOrigins() {
  const rawValue = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
}

export function applyCors(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = readAllowedCorsOrigins();
  const requestOrigin = typeof req.headers.origin === "string" ? normalizeOrigin(req.headers.origin) : "";

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}

