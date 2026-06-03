// The flicker guarantee in test form: the SSR render of a client consumer must
// reflect the tz the provider was given (from the server cookie), NOT a browser
// read. If it does, server and client first paint agree and nothing flips.
process.env.TZ = "America/Los_Angeles";

import { TimeZoneProvider, useTimeZone } from "@/components/ui/hooks/use-time-zone";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

function Probe() {
    return <span>{useTimeZone()}</span>;
}

describe("useTimeZone / TimeZoneProvider", () => {
    test("SSR renders the provider's tz, independent of the host zone", () => {
        const html = renderToStaticMarkup(
            <TimeZoneProvider tz="Europe/Tirane">
                <Probe />
            </TimeZoneProvider>,
        );
        expect(html).toBe("<span>Europe/Tirane</span>");
    });

    test("defaults to UTC with no provider (server's pre-cookie fallback)", () => {
        expect(renderToStaticMarkup(<Probe />)).toBe("<span>UTC</span>");
    });
});
