/** @param {NS} ns */
export async function main(ns) {
    const args = ns.flags([
        ["server", ""],
    ]);
    ns.tprint(ns.getServer(args.server));
}
