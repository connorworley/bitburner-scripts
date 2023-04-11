const WORKER_NAME = "_worker";

/** @param {NS} ns */
export async function main(ns) {
    while (true) {
        for (const server of ns.getPurchasedServers()) {
            if (ns.getPlayer().money >= ns.getPurchasedServerUpgradeCost(server, ns.getServerMaxRam(server) * 2)) {
                ns.upgradePurchasedServer(server, ns.getServerMaxRam(server) * 2);
            }
        }
        
        if (ns.getPlayer().money >= ns.getPurchasedServerCost(1)) {
            ns.purchaseServer(WORKER_NAME, 1);
        }
        
        await ns.sleep(1000);
    }
}