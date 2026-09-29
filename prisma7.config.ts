// Prisma 7 config. Goes at the REPO ROOT, next to package.json — not in prisma/.
//
// In v7 the connection URL is no longer allowed in schema.prisma. The Prisma CLI
// (migrate, studio, db seed) reads it from here. Prisma Client reads it separately
// through a driver adapter — see lib/db.ts.
//
// Your scaffold may have generated this file under a different name (prisma7.config.ts).
// Prisma logs which file it loaded on every command: keep one file, delete the other,
// or you will edit one and Prisma will read the other.

import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
	schema: "prisma/schema.prisma",

	migrations: {
		path: "prisma/migrations",
		seed: "tsx prisma/seed.ts",
	},

	datasource: {
		url: env("DATABASE_URL"),
	},
});
