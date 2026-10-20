import fs from "node:fs";

const manifest = JSON.parse(
  fs.readFileSync(new URL("../dist/manifest.json", import.meta.url), "utf8"),
);

if (manifest.manifest_version !== 3) {
  throw new Error("Expected Manifest V3");
}

const required = ["activeTab", "storage"];

if (!Array.isArray(manifest.permissions)) {
  throw new Error("Missing extension permissions");
}

for (const permission of required) {
  if (!manifest.permissions.includes(permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}

if (manifest.permissions.length !== required.length) {
  throw new Error("Unexpected extension permissions");
}

if (!Array.isArray(manifest.host_permissions)) {
  throw new Error("Missing host permissions");
}

if (!manifest.background?.service_worker) {
  throw new Error("Missing service worker");
}

console.log("Extension manifest verified");
