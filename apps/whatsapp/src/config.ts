import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(currentDir, "..");

const envName = process.env.NODE_ENV === "production" ? ".env.production" : ".env";

// Allow package-local and cwd-based env files so the service can run both in dev and on a server.
dotenv.config({ path: path.resolve(packageDir, envName) });
dotenv.config({ path: path.resolve(process.cwd(), envName) });
dotenv.config({ path: path.resolve(packageDir, ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function readRequired(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variavel obrigatoria ausente: ${name}`);
  }

  return value;
}

function readBoolean(name: string, fallback: boolean) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  return value.toLowerCase() !== "false";
}

export const config = {
  port: Number(process.env.PORT ?? 4100),
  supabaseUrl: readRequired("SUPABASE_URL"),
  supabaseServiceRoleKey: readRequired("SUPABASE_SERVICE_ROLE_KEY"),
  allowedOrigins: (process.env.WHATSAPP_ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  allowNullOrigin: readBoolean("WHATSAPP_ALLOW_NULL_ORIGIN", false),
  allowFileOrigin: readBoolean("WHATSAPP_ALLOW_FILE_ORIGIN", false),
  authDir: path.resolve(packageDir, process.env.WHATSAPP_AUTH_DIR ?? "./.wwebjs_auth"),
  defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "55",
  reminderCron: process.env.WHATSAPP_REMINDER_CRON ?? "* * * * *",
  headless: readBoolean("WHATSAPP_HEADLESS", true),
  browserPath: process.env.WHATSAPP_BROWSER_PATH?.trim() || undefined,
};
