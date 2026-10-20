import { build } from "esbuild";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const output = resolve(root, "dist");

const target = process.argv[2] ?? "production";

if (!["production", "development"].includes(target)) {
  throw new Error(`Unsupported build target: ${target}`);
}

const origins = ["https://www.lumivox.it.com"];

if (target === "development") {
  origins.push("http://localhost:3000", "http://127.0.0.1:3000");
}

const extraOrigin = process.env.LUMIVOX_EXTENSION_SITE_ORIGIN?.trim();

if (extraOrigin) {
  const url = new URL(extraOrigin);

  if (url.origin !== extraOrigin) {
    throw new Error("LUMIVOX_EXTENSION_SITE_ORIGIN must be an exact origin.");
  }

  const isLocalDev =
    target === "development" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);

  if (url.protocol !== "https:" && !isLocalDev) {
    throw new Error("Untrusted extension site origin.");
  }

  origins.push(url.origin);
}

const approvedOrigins = [...new Set(origins)];

const matches = [
  ...new Set(
    approvedOrigins.map((origin) => {
      const url = new URL(origin);
      return `${url.protocol}//${url.hostname}/*`;
    }),
  ),
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  entryPoints: {
    background: resolve(root, "src/background.ts"),
    content: resolve(root, "src/content.ts"),
    popup: resolve(root, "src/popup.ts"),
  },
  outdir: output,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome116"],
  sourcemap: target === "development" ? "inline" : false,
  define: {
    __LUMIVOX_ALLOWED_ORIGINS__: JSON.stringify(approvedOrigins),
  },
});

await Promise.all([
  copyFile(resolve(root, "public/popup.html"), resolve(output, "popup.html")),
  copyFile(resolve(root, "public/popup.css"), resolve(output, "popup.css")),
]);

const manifest = {
  manifest_version: 3,
  name: "Lumivox Focus Companion",
  description: "Connect to Lumivox for focus session features.",
  version: "0.1.0",
  action: {
    default_title: "Lumivox Companion",
    default_popup: "popup.html",
  },
  background: {
    service_worker: "background.js",
  },
  permissions: ["activeTab"],
  content_scripts: [
    {
      matches,
      js: ["content.js"],
      run_at: "document_idle",
      all_frames: false,
    },
  ],
};

await writeFile(
  resolve(output, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

console.log(`Built Lumivox Extension for ${target}.`);
console.log("Approved origins:", approvedOrigins);
