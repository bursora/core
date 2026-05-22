"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps, ReactNode } from "react";

type Props = ComponentProps<typeof NextThemesProvider> & { children: ReactNode };

export function ThemeProvider({ children, ...props }: Props) {
    return (
        <NextThemesProvider disableTransitionOnChange {...props}>
            {children}
        </NextThemesProvider>
    );
}
