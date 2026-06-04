/**
 * Better-auth browser client. Pages and components import this; the server
 * never does. Supports two sign-in flows: email code (OTP) and Google OAuth.
 */

import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    plugins: [emailOTPClient()],
});
