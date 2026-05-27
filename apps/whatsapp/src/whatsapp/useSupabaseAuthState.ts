import { initAuthCreds, BufferJSON, type AuthenticationCreds, type SignalDataTypeMap } from "baileys";
import { supabaseAdmin } from "../lib/supabase.js";

const TABLE = "whatsapp_auth_keys";

async function readData(tenantId: string, key: string): Promise<any | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", key)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return JSON.parse(data.value, BufferJSON.reviver);
}

async function writeData(tenantId: string, key: string, value: any) {
  const serialized = JSON.stringify(value, BufferJSON.replacer);

  const { error } = await supabaseAdmin.from(TABLE).upsert(
    { tenant_id: tenantId, key, value: serialized },
    { onConflict: "tenant_id,key" },
  );

  if (error) {
    console.error(`[auth-state] falha ao salvar ${key}:`, error.message);
  }
}

async function removeData(tenantId: string, key: string) {
  await supabaseAdmin.from(TABLE).delete().eq("tenant_id", tenantId).eq("key", key);
}

export async function clearSupabaseAuthState(tenantId: string) {
  await supabaseAdmin.from(TABLE).delete().eq("tenant_id", tenantId);
}

export async function useSupabaseAuthState(tenantId: string) {
  const creds: AuthenticationCreds = (await readData(tenantId, "creds")) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
          const result: { [id: string]: SignalDataTypeMap[T] } = {};

          for (const id of ids) {
            const value = await readData(tenantId, `${type}-${id}`);
            if (value) {
              result[id] = value;
            }
          }

          return result;
        },
        set: async (data: Record<string, Record<string, any>>) => {
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              if (value) {
                await writeData(tenantId, `${type}-${id}`, value);
              } else {
                await removeData(tenantId, `${type}-${id}`);
              }
            }
          }
        },
      },
    },
    saveCreds: async () => {
      await writeData(tenantId, "creds", creds);
    },
  };
}
