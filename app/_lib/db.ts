// Goes at app/_lib/db.ts
//
// PRISMA 7: PrismaClient no longer reads DATABASE_URL by itself. It needs a driver
// adapter for a direct database connection. For Postgres that is @prisma/adapter-pg:
//
//   pnpm add @prisma/adapter-pg
//
// The import path below is the `output` from your generator block in
// schema.prisma, NOT "@prisma/client" — v7 generates the client into your repo.
// If prisma init wrote a different output path, use that one.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
	connectionString: process.env.DATABASE_URL,
});

// Next.js hot-reloads in dev and would otherwise open a new connection on every
// reload until the pool is exhausted. One client, cached on globalThis.
const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}
