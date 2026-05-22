/**
 * Shared email validation.
 *
 * Single source of truth for "is this a valid email?" across the app:
 * auth/login, member invites, alert channels, and use cases that throw
 * on bad input.
 */

import { z } from "zod";

export const emailSchema = z.email("Enter a valid email address");

export const isValidEmail = (value: string): boolean => emailSchema.safeParse(value).success;
