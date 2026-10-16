/** Run a test file without inheriting other suites' module mocks or app caches. */
export async function runIsolatedTest(
    path: string,
    env: Record<string, string> = {},
): Promise<void> {
    const child = Bun.spawn([process.execPath, "test", path], {
        env: { ...process.env, ...env, BURSORA_ISOLATED_TEST: path },
        stdout: "pipe",
        stderr: "pipe",
    });
    const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    if (status !== 0) throw new Error(`Isolated test failed (${status}):\n${stdout}${stderr}`);
}
