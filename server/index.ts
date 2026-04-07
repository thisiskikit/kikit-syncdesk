import "./load-env";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { applyCors } from "./http/cors";
import { recoverBulkPriceRuns } from "./services/coupang/bulk-price-service";
import { resumeQueuedRuns } from "./services/execution-service";
import {
  recordApiRequestEvent,
  recordStartupEvent,
  recordSystemErrorEvent,
} from "./services/logs/service";
import { recoverNaverBulkPriceRuns } from "./services/naver/bulk-price-service";
import { sendNormalizedError } from "./services/shared/api-response";
import { serveStatic } from "./static";
import { setupVite } from "./vite";

const app = express();
const httpServer = createServer(app);
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || "5mb";

app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));
app.use(applyCors);

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    if (!req.path.startsWith("/api")) return;
    const durationMs = Date.now() - startedAt;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`);
    void recordApiRequestEvent({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      requestBodyBytes: Number(req.headers["content-length"] || 0) || null,
      responseContentLength: res.getHeader("content-length")?.toString() ?? null,
    });
  });
  next();
});

registerRoutes(app);

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  void recordSystemErrorEvent({
    source: "express",
    error: err,
    meta: {
      path: req.path,
      method: req.method,
    },
  });

  if (res.headersSent) {
    next(err);
    return;
  }
  sendNormalizedError(res, err, {
    fallbackCode: "INTERNAL_SERVER_ERROR",
    fallbackMessage: "Internal Server Error",
    fallbackStatus: 500,
  });
});

async function runStartupStep<T>(step: string, task: () => Promise<T> | T) {
  const startedAt = Date.now();

  try {
    const result = await task();
    await recordStartupEvent({
      step,
      durationMs: Date.now() - startedAt,
      status: "success",
    });
    return result;
  } catch (error) {
    await recordStartupEvent({
      step,
      durationMs: Date.now() - startedAt,
      status: "error",
      message: error instanceof Error ? error.message : `${step} failed.`,
      meta: {
        errorName: error instanceof Error ? error.name : null,
      },
    });
    throw error;
  }
}

async function runStartupRecoveries() {
  await runStartupStep("resumeQueuedRuns", () => resumeQueuedRuns());
  await runStartupStep("recoverBulkPriceRuns", () => recoverBulkPriceRuns());
  await runStartupStep("recoverNaverBulkPriceRuns", () => recoverNaverBulkPriceRuns());
}

async function start() {
  const startupStartedAt = Date.now();
  const shouldServeClientStatic =
    process.env.NODE_ENV === "production" && process.env.SERVE_CLIENT_STATIC !== "false";

  if (shouldServeClientStatic) {
    await runStartupStep("serveStatic", () => {
      serveStatic(app);
    });
  } else if (process.env.NODE_ENV !== "production") {
    await runStartupStep("setupVite", () => setupVite(httpServer, app));
  }

  const port = Number(process.env.APP_PORT || process.env.PORT || 5000);
  const host = process.env.HOST || "0.0.0.0";
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen({ port, host }, () => {
      httpServer.off("error", reject);
      console.log(`serving on ${host}:${port}`);
      resolve();
    });
  });

  await recordStartupEvent({
    step: "total",
    durationMs: Date.now() - startupStartedAt,
    status: "success",
    message: `Server ready on ${host}:${port}`,
    meta: {
      host,
      port,
      nodeEnv: process.env.NODE_ENV || "development",
    },
  });

  void runStartupRecoveries().catch((error) => {
    void recordSystemErrorEvent({
      source: "startupRecovery",
      error,
    });
    console.error(error);
  });
}

start().catch((error) => {
  void recordSystemErrorEvent({
    source: "start",
    error,
  });
  console.error(error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  void recordSystemErrorEvent({
    source: "unhandledRejection",
    error,
  });
  console.error(error);
});

process.on("uncaughtException", (error) => {
  void recordSystemErrorEvent({
    source: "uncaughtException",
    error,
  });
  console.error(error);
});
