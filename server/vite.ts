import { type Express, type NextFunction, type Request, type Response } from "express";
import { createServer as createViteServer } from "vite";
import { type Server } from "http";
import fs from "fs";
import path from "path";
import viteConfig from "../vite.config";

export async function setupVite(server: Server, app: Express) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: {
      middlewareMode: true,
      hmr: { server, path: "/vite-hmr" },
      allowedHosts: true,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);

  const renderIndex = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientTemplate = path.resolve(import.meta.dirname, "..", "client", "index.html");
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  };

  app.get("/", renderIndex);
  app.get("/{*path}", renderIndex);
}
