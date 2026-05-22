/**
 * Better-auth browser client. Pages and components import this; the server
 * never does. Magic-link signin is the only flow.
 */

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    plugins: [magicLinkClient()],
});
