import { cn } from "@/lib/utils";
import { codeToHtml, type BundledLanguage, type BundledTheme, type ShikiTransformer } from "shiki";

interface CodeBlockProps {
    readonly code: string;
    readonly lang?: BundledLanguage;
    readonly theme?: BundledTheme;
    readonly className?: string;
    readonly transformers?: readonly ShikiTransformer[];
}

export async function CodeBlock({
    code,
    lang = "typescript",
    theme,
    className,
    transformers,
}: CodeBlockProps) {
    // Shiki escapes all HTML entities in `code`; output HTML is trusted.
    const tx = transformers ? { transformers: [...transformers] as ShikiTransformer[] } : {};
    const html = theme
        ? await codeToHtml(code, { lang, theme, ...tx })
        : await codeToHtml(code, {
              lang,
              themes: { light: "github-light", dark: "github-dark" },
              defaultColor: false,
              ...tx,
          });

    return (
        <div
            className={cn(
                "overflow-x-auto text-xs leading-relaxed [&_pre]:p-4 [&_pre]:min-w-full [&_pre]:w-max [&_code]:font-mono",
                className,
            )}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
