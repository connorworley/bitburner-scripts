/** @param {NS} ns */
export async function main(ns) {
    const script = ns.args[0];
    const scriptArgs = ns.args.slice(1);

    const servers = discoverServers(ns);

    for (const server of servers) {
        ns.kill(script, server, ...scriptArgs);
    }
}

/** @param {NS} ns */
function discoverServers(ns) {
    const servers = new Set();
    const queue = ["home"];
    while (queue.length > 0) {
        const server = queue.pop();
        if (servers.has(server))
            continue;
        queue.push(...ns.scan(server));
        servers.add(server);
    }
    return Array.from(servers);
}