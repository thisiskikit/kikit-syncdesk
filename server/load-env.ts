import fs from "fs";
import path from "path";

let loaded = false;

export function loadProjectEnv() {
  if (loaded) {
    return;
  }

  loaded = true;

  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  process.loadEnvFile(envPath);
}

loadProjectEnv();
