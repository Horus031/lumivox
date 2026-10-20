import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

declare const __LUMIVOX_SUPABASE_URL__: string;
declare const __LUMIVOX_SUPABASE_PUBLISHABLE_KEY__: string;

const STORAGE_KEY = "lumivox.extension.auth.v1";

const storage = {
  async getItem(key: string): Promise<string | null> {
    const result = await chrome.storage.local.get(key);
    const value: unknown = result[key];

    return typeof value === "string" ? value : null;
  },

  async setItem(
    key: string,
    value: string,
  ): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },

  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};

let clientPromise: Promise<SupabaseClient> | null = null;

export function getExtensionAuthClient():
  Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      await chrome.storage.local.setAccessLevel({
        accessLevel: "TRUSTED_CONTEXTS",
      });

      return createClient(
        __LUMIVOX_SUPABASE_URL__,
        __LUMIVOX_SUPABASE_PUBLISHABLE_KEY__,
        {
          auth: {
            storage,
            storageKey: STORAGE_KEY,
            persistSession: true,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
    })().catch((error: unknown) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}