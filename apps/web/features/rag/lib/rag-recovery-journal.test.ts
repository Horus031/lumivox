import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecoveryReference, readRecoveryReference, writeRecoveryReference, type RagRecoveryReference,
} from "./rag-recovery-journal";

const account = "test-account";
const focus = "f6100000-0000-4000-8000-000000000011";
const request = "f6110000-0000-4000-8000-000000000001";
const key = `lumivox:rag-recovery:v1:${account}:${focus}`;

function reference(overrides: Partial<RagRecoveryReference> = {}): RagRecoveryReference {
  return {
    version: 1, protocol: "rag-v2", operation: "ask", clientRequestId: request,
    focusSessionId: focus, sessionId: null, createdAt: Date.now(), ...overrides,
  };
}

describe("RAG recovery journal", () => {
  beforeEach(() => sessionStorage.clear());

  it("isolates accounts and strips questions and document IDs from storage", () => {
    const value = reference();
    const withExtra = { ...value, question: "not stored", selectedDocumentIds: ["private"] };
    expect(writeRecoveryReference(account, withExtra)).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual(value);
    expect(readRecoveryReference("another-account", focus)).toBeNull();
  });

  it("cannot clear a newer pending operation", () => {
    const newer = reference({ clientRequestId: "f6110000-0000-4000-8000-000000000002" });
    writeRecoveryReference(account, newer);
    clearRecoveryReference(account, focus, request);
    expect(readRecoveryReference(account, focus)).toEqual(newer);
    clearRecoveryReference(account, focus, newer.clientRequestId);
    expect(readRecoveryReference(account, focus)).toBeNull();
  });

  it.each(["malformed JSON", '{"broken":true}'])("discards corrupt storage (%s)", (raw) => {
    sessionStorage.setItem(key, raw);
    expect(readRecoveryReference(account, focus)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("rejects old, future and wrong-focus references", () => {
    for (const invalid of [
      reference({ createdAt: Date.now() - 25 * 60 * 60 * 1000 }),
      reference({ createdAt: Date.now() + 60_000 }),
      reference({ focusSessionId: "f6100000-0000-4000-8000-000000000013" }),
    ]) {
      sessionStorage.setItem(key, JSON.stringify(invalid));
      expect(readRecoveryReference(account, focus)).toBeNull();
    }
  });

  it("tolerates inaccessible storage", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("blocked"); });
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error("blocked"); });
    try {
      expect(writeRecoveryReference(account, reference())).toBe(false);
      expect(readRecoveryReference(account, focus)).toBeNull();
      expect(() => clearRecoveryReference(account, focus, request)).not.toThrow();
    } finally {
      set.mockRestore();
      get.mockRestore();
    }
  });
});
