import { NS } from "ns2";

interface IArgs {
    server: string;
    delay: number;
    forever: boolean;
}

export async function main(ns: NS) {
    const args = <IArgs><unknown>ns.flags([
        ["server", ""],
        ["delay", 0],
        ["forever", false],
    ]);
    do {
        await ns.sleep(args.delay);
        await ns.hack(args.server);
    } while (args.forever);
}
