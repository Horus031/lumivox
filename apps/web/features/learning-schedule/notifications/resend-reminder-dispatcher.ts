import { generateUnsubscribeToken } from "./unsubscribe-token";
import { renderReminderEmail } from "./reminder-email-template";
import { decryptReminderPayload,encryptReminderPayload,type PayloadSnapshot } from "./resend-payload";
import { resolveReminderContext,type ResolvedReminderContext } from "./resolve-reminder-context";
import type { EmailTransport,SubmissionResult } from "./reminder-provider.types";
export type ReminderClaim={jobId:string;leaseToken:string};
/** Every method resolves ONLY AFTER its DB transaction commits. */
export interface ResendDispatchStore {
  gate():Promise<boolean>; preview(size:number):Promise<string[]>; claim(size:number):Promise<ReminderClaim[]>;
  resolve(jobId:string,leaseToken?:string):Promise<unknown>; load(claim:ReminderClaim):Promise<PayloadSnapshot|null>;
  prepare(claim:ReminderClaim,context:ResolvedReminderContext,input:{envelope:string;fingerprint:string;tokenHash:string}):Promise<PayloadSnapshot>;
  authorize(claim:ReminderClaim,context:ResolvedReminderContext):Promise<{authorized:boolean;deliveryId?:string}>;
  record(claim:ReminderClaim,deliveryId:string,fingerprint:string,result:SubmissionResult):Promise<void>;
  reconcile():Promise<void>;
}
export type ResendDispatchConfig={enabled:boolean;allowlist:ReadonlySet<string>;identityKey:string;encryptionKey:Buffer;from:string;trustedOrigin:string;publicUnsubscribeOrigin?:string};
export async function dispatchResendReminders(store:ResendDispatchStore,transport:EmailTransport,config:ResendDispatchConfig,options:{dryRun?:boolean;batchSize?:number}={}) {
  const size=options.batchSize??5;
  if (!Number.isInteger(size)||size<1||size>5) throw new Error("Invalid batch size");
  const counts={inspected:0,eligible:0,accepted:0,rejected:0,uncertain:0,held:0};
  const deadline=Date.now()+30000;
  if (!options.dryRun&&!config.enabled || config.allowlist.size===0) return counts;
  if (!options.dryRun&&!await store.gate()) return counts;
  if (options.dryRun) {
    for (const id of await store.preview(size)) {counts.inspected++;if(resolveReminderContext(await store.resolve(id),config.allowlist,config.identityKey).success) counts.eligible++;}
    return counts; // no claim, token issuance, snapshot, handoff or transport
  }
  await store.reconcile();
  const claims=await store.claim(size);
  for(const claim of claims) {
    if (Date.now()>deadline) break; // unused claims recover via reconciler
    counts.inspected++;
    try {
      const resolved=resolveReminderContext(await store.resolve(claim.jobId,claim.leaseToken),config.allowlist,config.identityKey);
      if(!resolved.success){counts.held++;continue;}
      const c=resolved.context;counts.eligible++;
      let snapshot=await store.load(claim);
      if(!snapshot) {
        const {token,hash}=generateUnsubscribeToken();
        const origin=new URL(config.trustedOrigin);
        if(origin.protocol!=="https:"||origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash) throw new Error("Invalid origin");
        const confirmation=new URL(`/${c.locale}/study-reminders/unsubscribe`,origin);confirmation.searchParams.set("token",token);
        const oneClick=new URL("/api/study-reminders/unsubscribe",config.publicUnsubscribeOrigin ?? origin.origin);oneClick.searchParams.set("token",token);
        const content=renderReminderEmail({taskId:c.taskId,taskTitle:c.taskTitle,locale:c.locale,scheduledStartAt:c.scheduledStartAt,scheduledEndAt:c.scheduledEndAt,timezone:c.timezone,leadMinutes:c.leadMinutes},{trustedOrigin:origin.origin,unsubscribeUrl:confirmation.href});
        const encrypted=encryptReminderPayload({...content,recipient:c.recipient,from:config.from,idempotencyKey:c.idempotencyKey,unsubscribeUrl:oneClick.href},config.encryptionKey,claim.jobId);
        snapshot=await store.prepare(claim,c,{...encrypted,tokenHash:hash});
      }
      const email=decryptReminderPayload(snapshot,config.encryptionKey);
      if(snapshot.context_hash!==c.contextHash || snapshot.recipient_fingerprint!==c.recipientFingerprint || snapshot.locale!==c.locale ||
        email.recipient!==c.recipient || email.idempotencyKey!==c.idempotencyKey || email.from!==config.from || !email.unsubscribeUrl ||
        new URL(email.unsubscribeUrl).origin!==new URL(config.publicUnsubscribeOrigin ?? config.trustedOrigin).origin) throw new Error("Stale payload");
      // Leave room for authorize (4s), transport (10s), persistence (4s).
      if(deadline-Date.now()<19000){counts.held++;continue;}
      const authorization=await store.authorize(claim,c); // durable commit before send
      if(!authorization.authorized||!authorization.deliveryId){counts.held++;continue;}
      let result:SubmissionResult;
      try {result=await transport.send(email);} catch {result={kind:"uncertain",code:"transport_error"};}
      // No code below may send again. Failed persistence leaves submitting for
      // expired-lease reconciliation; timeout/409 never rotates keys or payloads.
      try {await store.record(claim,authorization.deliveryId,snapshot.payload_fingerprint,result);} catch {counts.held++;continue;}
      counts[result.kind]++;
    } catch {counts.held++;} // diagnostics are counts only, never raw errors/context
  }
  return counts;
}
