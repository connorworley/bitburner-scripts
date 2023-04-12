import { NS } from "ns2";

export async function walkServersWithCtx<Ctx>(
    ns: NS,
    initialHostname: string,
    callback: (hostname: string, ctx: Ctx) => Promise<Ctx>,
    initialCtx: Ctx,
) {
    const stack: [string, Ctx][] = [[initialHostname, initialCtx]];
    const visitedHostnames = new Set<string>();
    while (stack.length > 0) {
        const [hostname, ctx] = stack.pop()!;
        if (visitedHostnames.has(hostname))
            continue;
        const newCtx = await callback(hostname, ctx);
        stack.push(
            ...ns.scan(hostname).map<[string, Ctx]>(
                childHostname => [childHostname, newCtx]
            )
        );
        visitedHostnames.add(hostname);
    }
}

export async function walkServers(
    ns: NS,
    initialHostname: string,
    callback: (hostname: string) => Promise<void>,
) {
    return walkServersWithCtx<null>(
        ns,
        initialHostname,
        async (hostname: string, ctx: null) => {
            await callback(hostname);
            return null;
        },
        null,
    );
}