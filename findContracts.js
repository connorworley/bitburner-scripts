/** @param {NS} ns */
export async function main(ns) {
    const servers = new Set();
    const queue = ["home"];
    while (queue.length > 0) {
        const server = queue.pop();
        if (servers.has(server))
            continue;
        queue.push(...ns.scan(server));
        servers.add(server);
        for (const contract of ns.ls(server, ".cct")) {
            ns.tprint(`${contract} on ${server}`);
        }
    }
}