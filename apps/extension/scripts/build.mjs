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

const productionOrigin = "https://www.lumivox.it.com";

const origins = [productionOrigin];

if (target === "development") {
  origins.push("http://localhost:3000", "http://127.0.0.1:3000");
}

const extraOrigin = process.env.LUMIVOX_EXTENSION_SITE_ORIGIN?.trim();

if (extraOrigin) {
  const parsed = new URL(extraOrigin);

  if (parsed.origin !== extraOrigin) {
    throw new Error("Site origin must be exact.");
  }

  const localDevelopment =
    target === "development" &&
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(parsed.hostname);

  if (parsed.protocol !== "https:" && !localDevelopment) {
    throw new Error("Invalid extension site origin.");
  }

  origins.push(extraOrigin);
}

const approvedOrigins = [...new Set(origins)];

const apiOrigin =
  process.env.LUMIVOX_EXTENSION_API_ORIGIN?.trim() ??
  (target === "development" ? "http://localhost:3000" : productionOrigin);

if (!approvedOrigins.includes(apiOrigin)) {
  throw new Error("API origin must match an approved Lumivox origin.");
}

const supabaseUrl = process.env.LUMIVOX_EXTENSION_SUPABASE_URL?.trim();

const publishableKey =
  process.env.LUMIVOX_EXTENSION_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseUrl || !publishableKey) {
  throw new Error("Missing public Supabase configuration.");
}

const parsedSupabaseUrl = new URL(supabaseUrl);

if (
  parsedSupabaseUrl.origin !== supabaseUrl ||
  parsedSupabaseUrl.protocol !== "https:"
) {
  throw new Error("Supabase URL must be an exact HTTPS origin.");
}

const contentMatches = [
  ...new Set(
    approvedOrigins.map((origin) => {
      const url = new URL(origin);
      return `${url.protocol}//${url.hostname}/*`;
    }),
  ),
];

const hostPermissions = [
  ...new Set([
    `${parsedSupabaseUrl.protocol}//${parsedSupabaseUrl.hostname}/*`,
    ...[apiOrigin].map((origin) => {
      const url = new URL(origin);
      return `${url.protocol}//${url.hostname}/*`;
    }),
  ]),
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
    __LUMIVOX_API_ORIGIN__: JSON.stringify(apiOrigin),
    __LUMIVOX_SUPABASE_URL__: JSON.stringify(supabaseUrl),
    __LUMIVOX_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(publishableKey),
  },
});

await Promise.all([
  copyFile(resolve(root, "public/popup.html"), resolve(output, "popup.html")),
  copyFile(resolve(root, "public/popup.css"), resolve(output, "popup.css")),
]);

const manifest = {
  manifest_version: 3,
  name: "Lumivox Focus Companion",
  description: "Securely connect your Lumivox account.",
  version: "0.2.0",
  action: {
    default_title: "Lumivox Companion",
    default_popup: "popup.html",
  },
  background: {
    service_worker: "background.js",
  },
  permissions: ["activeTab", "storage"],
  host_permissions: hostPermissions,
  content_scripts: [
    {
      matches: contentMatches,
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

console.log(`Built Lumivox Extension (${target}).`);

console.log("API origin:", apiOrigin);
console.log("Supabase origin:", supabaseUrl);
