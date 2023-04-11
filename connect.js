/** @param {NS} ns */
export async function main(ns) {
    const args = ns.flags([
        ["server", "home"],
    ]);
    const servers = new Set();
    const queue = [["home", []]];
    while (queue.length > 0) {
        const [parentServer, path] = queue.pop();
        if (parentServer == args.server) {
            for (const server of [...path, parentServer]) {
                ns.singularity.connect(server);
            }
            return;
        }
        if (servers.has(parentServer))
            continue;
        queue.push(...ns.scan(parentServer).map(childServer => [childServer, [...path, parentServer]]));
        servers.add(parentServer);
    }
}