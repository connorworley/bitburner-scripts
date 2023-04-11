/** @param {NS} ns */
export async function main(ns) {
    const servers = new Set();
    const queue = [["home", 0]];
    while (queue.length > 0) {
        const [server, depth] = queue.pop();
        if (servers.has(server))
            continue;
        queue.push(...ns.scan(server).map(server => [server, depth+1]));
        servers.add(server);
        ns.tprint(`${'-'.repeat(depth)}${server} (${ns.getServerRequiredHackingLevel(server)})`);
    }
}