import { NS } from "ns2";

interface IArgs {
    forever: boolean;
}

export async function main(ns: NS) {
    const args = <IArgs><unknown>ns.flags([
        ["forever", false],
    ]);
    do {
        await ns.share();
    } while (args.forever);
}
