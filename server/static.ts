import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(`Build output not found: ${distPath}`);
  }

  app.use(express.static(distPath));
  const sendIndex = (_req: express.Request, res: express.Response) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  };

  app.get("/", sendIndex);
  app.get("/{*path}", sendIndex);
}
