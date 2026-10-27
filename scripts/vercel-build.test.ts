/** @jest-environment node */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.join(__dirname, "vercel-build.sh");

// Stub prisma, pnpm and next on PATH. Each appends its argv to a log; FAIL_ON
// makes the stub whose argv matches exit 1.
function run(env: Record<string, string>) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-build-"));
	const log = path.join(dir, "log");
	for (const bin of ["prisma", "pnpm", "next"]) {
		const stub = path.join(dir, bin);
		fs.writeFileSync(
			stub,
			`#!/usr/bin/env bash\necho "${bin} $*" >> "${log}"\n[ "\${FAIL_ON:-}" = "${bin} $*" ] && exit 1\nexit 0\n`,
		);
		fs.chmodSync(stub, 0o755);
	}
	const result = spawnSync("bash", [SCRIPT], {
		env: { NODE_ENV: "test", PATH: `${dir}:${process.env.PATH ?? ""}`, ...env },
		encoding: "utf8",
	});
	const steps = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [];
	fs.rmSync(dir, { recursive: true, force: true });
	return { status: result.status, steps, output: result.stdout + result.stderr };
}

describe("vercel-build.sh", () => {
	it("production with DEMO_SEED=true: generate, migrate, seed, build", () => {
		const r = run({ VERCEL_ENV: "production", DEMO_SEED: "true" });
		expect(r.status).toBe(0);
		expect(r.steps).toEqual(["prisma generate", "prisma migrate deploy", "pnpm db:seed", "next build"]);
	});

	it("production without DEMO_SEED: no seed", () => {
		const r = run({ VERCEL_ENV: "production" });
		expect(r.steps).toEqual(["prisma generate", "prisma migrate deploy", "next build"]);
	});

	it("preview never migrates or seeds, even with DEMO_SEED=true", () => {
		const r = run({ VERCEL_ENV: "preview", DEMO_SEED: "true" });
		expect(r.steps).toEqual(["prisma generate", "next build"]);
	});

	it("no VERCEL_ENV (local) behaves like preview", () => {
		expect(run({}).steps).toEqual(["prisma generate", "next build"]);
	});

	it("a failed migration stops the build", () => {
		const r = run({ VERCEL_ENV: "production", DEMO_SEED: "true", FAIL_ON: "prisma migrate deploy" });
		expect(r.status).not.toBe(0);
		expect(r.steps).toEqual(["prisma generate", "prisma migrate deploy"]);
	});

	it("never prints environment values", () => {
		const r = run({ VERCEL_ENV: "production", DEMO_SEED: "true", DATABASE_URL: "postgresql://secret-value" });
		expect(r.output).not.toContain("secret-value");
	});
});
