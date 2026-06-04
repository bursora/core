/**
 * Root entry. The app surface lives under `/workspace`; `/` itself has no UI.
 * Redirect there so `/workspace` can resolve the active workspace (or bounce to
 * `/login` via `requireSessionUI` when there's no session).
 */

import { redirect } from "next/navigation";

export default function RootPage() {
    redirect("/workspace");
}
