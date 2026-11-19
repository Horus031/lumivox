import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const projectId = "prj_SE0K3y3prJEcNFdUugAHZblAtyEq";
export const teamId = "team_Ir0Jn7K20BJf8GRuGGkw9HzZ";

export async function releaseVercel(mode, env = process.env, request = fetch) {
  if (!["preflight", "deploy"].includes(mode)) throw new Error("Use preflight or deploy.");
  if (!/^[a-f0-9]{40}$/.test(env.EXPECTED_SHA || "")) throw new Error("Expected full tested SHA is required.");
  if (!env.VERCEL_TOKEN) throw new Error("Production VERCEL_TOKEN is required before database deployment.");
  const guard = JSON.parse(readFileSync(new URL("../../apps/web/vercel.json", import.meta.url), "utf8"));
  if (guard.git?.deploymentEnabled?.main !== false ||
      guard.git?.deploymentEnabled?.["product-release"] !== false) {
    throw new Error("Automatic Git deployment must remain disabled for release branches.");
  }
  const call = async (path, body) => {
    const response = await request(`https://api.vercel.com${path}?teamId=${teamId}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Vercel release request failed (HTTP ${response.status}).`);
    return response.json();
  };
  const project = await call(`/v9/projects/${projectId}`);
  if (project.id !== projectId || project.rootDirectory !== "apps/web" ||
      project.link?.type !== "github" || project.link?.org !== "Horus031" ||
      project.link?.repo !== "lumivox" || project.link?.productionBranch !== "main") {
    throw new Error("Vercel project root, repository or Production branch does not match the approved binding.");
  }
  if (mode === "preflight") return { projectId, sha: env.EXPECTED_SHA };
  const deployment = await call("/v13/deployments", {
    name: "lumivox", project: projectId, target: "production",
    gitSource: { type: "github", org: "Horus031", repo: "lumivox", ref: "main", sha: env.EXPECTED_SHA },
  });
  if (!/^dpl_[a-zA-Z0-9]+$/.test(deployment.id || "") ||
      (deployment.gitSource?.sha && deployment.gitSource.sha !== env.EXPECTED_SHA)) {
    throw new Error("Vercel deployment response did not match the release request.");
  }
  return { projectId, sha: env.EXPECTED_SHA, deploymentId: deployment.id };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await releaseVercel(process.argv[2]);
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `\nVercel ${process.argv[2]}: tested SHA \`${result.sha}\`${result.deploymentId ? `, deployment \`${result.deploymentId}\`` : ""}.\n`);
    }
  } catch (error) {
    // Provider response bodies and transport errors can contain credentials or URLs.
    console.error(error.message.startsWith("Vercel release request failed") ||
      error.message.startsWith("Vercel project") || error.message.startsWith("Production VERCEL_TOKEN") ||
      error.message.startsWith("Expected full") || error.message.startsWith("Automatic Git") ||
      error.message.startsWith("Vercel deployment") || error.message === "Use preflight or deploy."
      ? error.message : "Vercel release request unavailable; inspect project access and configuration.");
    process.exitCode = 1;
  }
}
