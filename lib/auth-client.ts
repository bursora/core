/**
 * Better-auth browser client. Pages and components import this; the server
 * never does. Supports two sign-in flows: magic link and Google OAuth.
 */

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    plugins: [magicLinkClient()],
});
