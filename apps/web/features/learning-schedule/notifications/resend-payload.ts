import { createCipheriv,createDecipheriv,createHash,randomBytes } from "node:crypto";
import { z } from "zod";
import { reminderEmailSchema } from "./resend-reminder-provider";
import type { ReminderEmail } from "./reminder-provider.types";
export const payloadSnapshotSchema = z.object({job_id:z.uuid(),user_id:z.uuid(),context_hash:z.string(),payload_fingerprint:z.string(),recipient_fingerprint:z.string(),locale:z.enum(["en","vi"]),token_hash:z.string(),encrypted_payload:z.string(),created_at:z.string()}).strict();
export type PayloadSnapshot = z.infer<typeof payloadSnapshotSchema>;
export function reminderEncryptionKey(raw: string): Buffer {
  const key=Buffer.from(raw,"base64");
  if (key.length!==32 || key.toString("base64")!==raw) throw new Error("Invalid payload encryption configuration");
  return key;
}
export function serializeReminderPayload(raw: unknown): string {
  const email=reminderEmailSchema.parse(raw);
  if (!email.unsubscribeUrl) throw new Error("Missing unsubscribe capability");
  return JSON.stringify(email);
}
export const reminderPayloadFingerprint=(serialized:string)=>createHash("sha256").update(serialized).digest("hex");
export function encryptReminderPayload(email:ReminderEmail,key:Buffer,jobId:string) {
  const serialized=serializeReminderPayload(email),iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(`lumivox-reminder:v1:${jobId}`));
  const encrypted=Buffer.concat([cipher.update(serialized,"utf8"),cipher.final()]);
  return {fingerprint:reminderPayloadFingerprint(serialized),envelope:`v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`};
}
export function decryptReminderPayload(snapshot:PayloadSnapshot,key:Buffer):ReminderEmail {
  const [version,iv,tag,body,...extra]=snapshot.encrypted_payload.split(".");
  if (version!=="v1"||!iv||!tag||!body||extra.length) throw new Error("Invalid payload envelope");
  const decode=(raw:string,length?:number)=>{const bytes=Buffer.from(raw,"base64url");if(!/^[A-Za-z0-9_-]+$/.test(raw)||bytes.toString("base64url")!==raw||(length!==undefined&&bytes.length!==length)) throw new Error("Invalid payload envelope");return bytes;};
  const decipher=createDecipheriv("aes-256-gcm",key,decode(iv,12));
  decipher.setAAD(Buffer.from(`lumivox-reminder:v1:${snapshot.job_id}`));decipher.setAuthTag(decode(tag,16));
  const serialized=Buffer.concat([decipher.update(decode(body)),decipher.final()]).toString("utf8");
  if (reminderPayloadFingerprint(serialized)!==snapshot.payload_fingerprint) throw new Error("Payload fingerprint mismatch");
  return reminderEmailSchema.parse(JSON.parse(serialized));
}
