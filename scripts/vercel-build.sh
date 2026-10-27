#!/usr/bin/env bash
# Vercel's build command (vercel.json). Migrates and seeds in production only;
# preview and local builds just generate the client and build.
# Any failing step fails the deploy, and the previous version stays live.
# Never echo environment values here.
set -euo pipefail

echo "▸ prisma generate"
prisma generate

if [ "${VERCEL_ENV:-}" = "production" ]; then
	echo "▸ prisma migrate deploy"
	prisma migrate deploy
	if [ "${DEMO_SEED:-}" = "true" ]; then
		echo "▸ demo seed"
		pnpm db:seed
	fi
fi

echo "▸ next build"
next build
