import { NS } from "ns2";

export function walkServersWithCtx<Ctx>(
    ns: NS,
    initialHostname: string,
    callback: (hostname: string, ctx: Ctx) => Ctx,
    initialCtx: Ctx,
) {
    const stack: [string, Ctx][] = [[initialHostname, initialCtx]];
    const visitedHostnames = new Set<string>();
    while (stack.length > 0) {
        const [hostname, ctx] = stack.pop()!;
        if (visitedHostnames.has(hostname))
            continue;
        const newCtx = callback(hostname, ctx);
        stack.push(
            ...ns.scan(hostname).map<[string, Ctx]>(
                childHostname => [childHostname, newCtx]
            )
        );
        visitedHostnames.add(hostname);
    }
}

export function walkServers(
    ns: NS,
    initialHostname: string,
    callback: (hostname: string) => void,
) {
    return walkServersWithCtx<null>(
        ns,
        initialHostname,
        (hostname: string, ctx: null) => {
            callback(hostname);
            return null;
        },
        null,
    );
}