import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_MIN_UPTIME_MS = 10_000;
const DEFAULT_INITIAL_RESTART_DELAY_MS = 1_000;
const DEFAULT_MAX_RESTART_DELAY_MS = 15_000;
const DEFAULT_PORT = 5000;

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function resolveChildCommand() {
  const [, , ...args] = process.argv;
  if (!args.length) {
    throw new Error(
      "Expected a command to supervise. Example: node script/run-supervised.js node dist/index.js",
    );
  }

  const [command, ...commandArgs] = args;
  return {
    command,
    commandArgs,
  };
}

function resolveServerAddress() {
  const port = readPositiveInteger(
    process.env.APP_PORT ?? process.env.PORT,
    DEFAULT_PORT,
  );
  const host = process.env.HOST || "0.0.0.0";
  return { host, port };
}

function isPortBusy(host, port) {
  return new Promise((resolve) => {
    const tester = net.createServer();

    tester.once("error", (error) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "EADDRINUSE" || error.code === "EACCES")
      ) {
        resolve(true);
        return;
      }

      resolve(false);
    });

    tester.once("listening", () => {
      tester.close(() => resolve(false));
    });

    tester.listen({
      host,
      port,
      exclusive: true,
    });
  });
}

async function main() {
  const { command, commandArgs } = resolveChildCommand();
  const minUptimeMs = readPositiveInteger(
    process.env.APP_RESTART_MIN_UPTIME_MS,
    DEFAULT_MIN_UPTIME_MS,
  );
  const initialRestartDelayMs = readPositiveInteger(
    process.env.APP_RESTART_DELAY_MS,
    DEFAULT_INITIAL_RESTART_DELAY_MS,
  );
  const maxRestartDelayMs = readPositiveInteger(
    process.env.APP_RESTART_MAX_DELAY_MS,
    DEFAULT_MAX_RESTART_DELAY_MS,
  );
  const { host, port } = resolveServerAddress();

  let child = null;
  let stopping = false;
  let restartDelayMs = initialRestartDelayMs;

  const stopChild = (signal) => {
    stopping = true;
    if (child?.exitCode === null) {
      child.kill(signal);
      return;
    }
    process.exit(0);
  };

  process.on("SIGINT", () => stopChild("SIGINT"));
  process.on("SIGTERM", () => stopChild("SIGTERM"));

  while (!stopping) {
    const startedAt = Date.now();
    child = spawn(command, commandArgs, {
      stdio: "inherit",
      env: process.env,
      shell: false,
    });

    const result = await new Promise((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
      child.once("error", (error) => resolve({ code: 1, signal: null, error }));
    });

    child = null;

    if (stopping) {
      process.exit(0);
    }

    if (result.error) {
      console.error("[supervisor] Failed to start child process.", result.error);
    }

    const uptimeMs = Date.now() - startedAt;
    const exitDescription = result.signal
      ? `signal ${result.signal}`
      : `code ${result.code ?? 0}`;

    if (result.code === 0 && !result.signal) {
      process.exit(0);
    }

    if (uptimeMs < minUptimeMs && (await isPortBusy(host, port))) {
      console.error(
        `[supervisor] Child exited with ${exitDescription}, and ${host}:${port} is already in use. Stopping restart loop.`,
      );
      process.exit(result.code ?? 1);
    }

    console.error(
      `[supervisor] Child exited with ${exitDescription} after ${uptimeMs}ms. Restarting in ${restartDelayMs}ms.`,
    );

    await delay(restartDelayMs);

    restartDelayMs =
      uptimeMs >= minUptimeMs
        ? initialRestartDelayMs
        : Math.min(maxRestartDelayMs, restartDelayMs * 2);
  }
}

main().catch((error) => {
  console.error("[supervisor] Fatal supervisor error.", error);
  process.exit(1);
});
