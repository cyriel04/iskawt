"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// Browser side of Better Auth. Used by SignInForm and AccountMenu only.
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
