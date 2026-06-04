"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const COOKIE = "bursora-reactivated";

/**
 * One-shot welcome-back toast after an account deletion is cancelled by signing
 * back in. The auth sign-in hook sets a short-lived `bursora-reactivated`
 * cookie on reactivation; this reads it once on the first dashboard render,
 * shows the toast, and clears the cookie so it never repeats.
 */
export function ReactivatedToast() {
    useEffect(() => {
        const hit = document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`));
        if (!hit) return;
        document.cookie = `${COOKIE}=; Max-Age=0; Path=/`;
        toast.success("Welcome back — your account deletion was cancelled.");
    }, []);

    return null;
}
