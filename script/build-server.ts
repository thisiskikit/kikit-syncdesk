import { build as esbuild } from "esbuild";
import { readFile } from "fs/promises";

async function buildServer() {
  const pkg = JSON.parse(await readFile("package.json", "utf-8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const external = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/index.js",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    external,
  });
}

buildServer().catch((error) => {
  console.error(error);
  process.exit(1);
});

