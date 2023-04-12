import { NS, Server } from "ns2";

interface Batch {
    hackThreads: number;
    postHackWeakenThreads: number;
    growThreads: number;
    postGrowWeakenThreads: number;
}

function calculateBatchForServer(ns: NS, server: Server, hackThreads: number = 1): Batch {
    const weakenAmountPerThread = ns.weakenAnalyze(1);
    
    const hackSecurityIncrease = ns.hackAnalyzeSecurity(hackThreads, server.hostname);
    const postHackWeakenThreads = Math.ceil(hackSecurityIncrease / weakenAmountPerThread);
}

export async function main(ns: NS) {
    
}