import { readFile,readdir,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
/** Run actual repository TS in standalone LOCAL harnesses. Transpile only;
 * full tsc is a separate gate. No alternative worker implementation/mocks here. */
export async function loadReminderRuntime(root) {
 const require=createRequire(resolve(root,'apps/web/package.json')),ts=require('typescript');
 const source=resolve(root,'apps/web/features/learning-schedule/notifications');
 const output=resolve(root,'apps/web/.next/step-8d-runtime');await mkdir(output,{recursive:true});
 for(const filename of await readdir(source)) {
  if(!filename.endsWith('.ts')||filename.endsWith('.test.ts')) continue;
  const code=await readFile(resolve(source,filename),'utf8');
  const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,verbatimModuleSyntax:true}}).outputText
   .replace(/from (["'])(\.\/[^"']+)\1/g,(_match,quote,path)=>`from ${quote}${path}.mjs${quote}`);
  await writeFile(resolve(output,filename.replace(/\.ts$/,'.mjs')),js);
 }
 return {
  worker:await import(pathToFileURL(resolve(output,'resend-reminder-dispatcher.mjs')).href),
  store:await import(pathToFileURL(resolve(output,'resend-dispatch-store.mjs')).href),
  resolver:await import(pathToFileURL(resolve(output,'resolve-reminder-context.mjs')).href),
  payload:await import(pathToFileURL(resolve(output,'resend-payload.mjs')).href),
 };
}
