// Prisma 7 config. Goes at the REPO ROOT, next to package.json — not in prisma/.
//
// In v7 the connection URL is no longer allowed in schema.prisma. The Prisma CLI
// (migrate, studio, db seed) reads it from here. Prisma Client reads it separately
// through a driver adapter — see app/_lib/db.ts.

import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
	schema: "prisma/schema.prisma",

	migrations: {
		path: "prisma/migrations",
		seed: "tsx prisma/seed.ts",
	},

	datasource: {
		// Neon: the app uses the pooled DATABASE_URL; migrations need the direct
		// connection. Unset locally and in CI, where there is only one URL.
		url: process.env.DIRECT_DATABASE_URL || env("DATABASE_URL"),
	},
});
