/** @param {NS} ns */
export async function main(ns) {
    const args = ns.flags([
        ["server", ""],
        ["delay", 0],
        ["forever", false],
    ]);
    do {
        await ns.sleep(args.delay);
        await ns.grow(args.server);
    } while (args.forever);
}
