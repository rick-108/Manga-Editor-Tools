import { defineConfig } from "drizzle-kit";
import path from "path";

// Match the same priority as lib/db/src/index.ts so migrations always
// target the same database the application connects to.
const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error("NEON_DATABASE_URL or DATABASE_URL must be set");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
