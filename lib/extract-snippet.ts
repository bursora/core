/**
 * Pure helper used by both the doc-build step and the doc-vs-code drift test.
 *
 * Reads an example file, finds the lines between `// region:<id>` and the
 * next `// endregion` marker, and returns them as a single string. Markers
 * are stripped; surrounding blank lines inside the region are trimmed; the
 * caller's interior indentation is preserved verbatim.
 *
 * Failure modes throw `RegionNotFoundError` with the file path and region
 * id so a missing or half-written marker fails loud and obvious in CI.
 */

import { readFileSync } from "node:fs";

const REGION_PREFIX = "// region:";
const REGION_END = "// endregion";

export class RegionNotFoundError extends Error {
    readonly filePath: string;
    readonly regionId: string;

    constructor(message: string, filePath: string, regionId: string) {
        super(message);
        this.name = "RegionNotFoundError";
        this.filePath = filePath;
        this.regionId = regionId;
    }
}

/**
 * Read `filePath` and return the snippet between `// region:<regionId>` and
 * the next `// endregion`. Throws `RegionNotFoundError` if the start marker
 * is missing or no `// endregion` follows it.
 */
export function extractRegion(filePath: string, regionId: string): string {
    const contents = readFileSync(filePath, "utf8");
    const lines = contents.split(/\r?\n/);

    const startMarker = `${REGION_PREFIX}${regionId}`;
    const startIdx = lines.findIndex((line) => line.trim() === startMarker);
    if (startIdx === -1) {
        throw new RegionNotFoundError(
            `Missing region marker "${startMarker}" in ${filePath}`,
            filePath,
            regionId,
        );
    }

    const endIdx = lines.findIndex((line, i) => i > startIdx && line.trim() === REGION_END);
    if (endIdx === -1) {
        throw new RegionNotFoundError(
            `Missing "// endregion" after "${startMarker}" in ${filePath}`,
            filePath,
            regionId,
        );
    }

    const body = lines.slice(startIdx + 1, endIdx);
    return trimBlankEdges(body).join("\n");
}

const trimBlankEdges = (lines: readonly string[]): readonly string[] => {
    let start = 0;
    let end = lines.length;
    while (start < end && lines[start]?.trim() === "") start++;
    while (end > start && lines[end - 1]?.trim() === "") end--;
    return lines.slice(start, end);
};
