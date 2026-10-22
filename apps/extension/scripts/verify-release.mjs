import { readFile, readdir } from "node:fs/promises";

import { resolve, relative } from "node:path";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const dist = resolve(root, "dist");

const expectedApiOrigin = "https://www.lumivox.it.com";

// Public project origin, not a secret key.
// Update this only when production Supabase changes.
const expectedSupabaseOrigin = "https://lslybjylsxtnznghrtyj.supabase.co";

const manifest = JSON.parse(
  await readFile(resolve(dist, "manifest.json"), "utf8"),
);

const packageJson = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.manifest_version === 3, "Manifest V3 required");

assert(
  manifest.version === packageJson.version,
  "Manifest/package version mismatch",
);

assert(
  JSON.stringify(manifest.permissions) ===
    JSON.stringify(["activeTab", "storage"]),
  "Unexpected required permissions",
);

assert(
  JSON.stringify(manifest.optional_permissions) === JSON.stringify(["tabs"]),
  "Unexpected optional permissions",
);

const expectedHosts = [`${expectedSupabaseOrigin}/*`, `${expectedApiOrigin}/*`];

assert(
  JSON.stringify([...manifest.host_permissions].sort()) ===
    JSON.stringify(expectedHosts.sort()),
  "Unexpected production host permissions",
);

assert(
  JSON.stringify(manifest.content_scripts[0].matches) ===
    JSON.stringify([`${expectedApiOrigin}/*`]),
  "Unexpected content script matches",
);

for (const size of [16, 32, 48, 128]) {
  const path = manifest.icons?.[String(size)];

  assert(
    path === `icons/icon-${size}.png`,
    `Missing icon declaration: ${size}`,
  );

  const data = await readFile(resolve(dist, path));

  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  assert(data.subarray(0, 8).equals(pngSignature), `Invalid PNG icon: ${size}`);

  assert(
    data.readUInt32BE(16) === size && data.readUInt32BE(20) === size,
    `Invalid icon dimensions: ${size}`,
  );
}

const jsFiles = ["background.js", "content.js", "popup.js"];

for (const name of jsFiles) {
  const source = await readFile(resolve(dist, name), "utf8");

  for (const forbidden of [
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AI_INTERNAL_API_KEY",
    "ci-public-placeholder",
  ]) {
    assert(
      !source.includes(forbidden),
      `Forbidden configuration marker in ${name}`,
    );
  }
}

// Reject accidental development-only output.
async function walk(directory) {
  const result = [];

  for (const entry of await readdir(directory, {
    withFileTypes: true,
  })) {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      result.push(...(await walk(path)));
    } else {
      result.push(relative(dist, path));
    }
  }

  return result;
}

const files = await walk(dist);

assert(
  !files.some((file) => file.endsWith(".map")),
  "Release must not contain source maps",
);

assert(
  !files.some(
    (file) =>
      file.includes(".env") ||
      file.includes("node_modules") ||
      file.includes(".git/"),
  ),
  "Unexpected release files",
);

const background = await readFile(resolve(dist, "background.js"), "utf8");

assert(
  background.includes(expectedSupabaseOrigin),
  "Production Supabase origin not embedded",
);

console.log("Production release artifact verified.");
console.log("Version:", manifest.version);
console.log("Files:", files.length);
