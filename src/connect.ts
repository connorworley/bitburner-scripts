import { NS } from "ns2";
import { walkServers, walkServersWithCtx } from "./common";

interface IArgs {
    server: string;
}

export async function main(ns: NS) {
    const args = <IArgs><unknown>ns.flags([
        ["server", ""],
    ]);
    
    walkServersWithCtx<string[]>(
        ns,
        "home",
        (hostname: string, ancestors: string[]) => {
            const path = [...ancestors, hostname];
            if (hostname == args.server) {
                path.forEach(ns.singularity.connect);
                ns.exit();
            }
            return path;
        },
        [],
    )

    ns.tprint(`Sever ${args.server} not found. Exiting.`);
}