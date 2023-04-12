import { NS, Player, Server } from "ns2";
import { walkServers } from "./common";

interface ThreadCounts {
    hackThreads: number;
    postHackWeakenThreads: number;
    growThreads: number;
    postGrowWeakenThreads: number;
}

interface Batch extends ThreadCounts {
    hostname: string;
    hackSecurityIncrease: number;
    hackMoneyDecrease: number;
}

function getHackTime(ns: NS, server: Server, player: Player): number {
    // TODO: Is there any benefit to using formulas?
    return ns.fileExists("Formulas.exe", "home") ? (
        ns.formulas.hacking.hackTime(server, player)
    ) : (
        ns.getHackTime(server.hostname)
        / player.mults.hacking_speed
    );
}

function getWeakenTime(ns: NS, server: Server, player: Player): number {
    // TODO: Is there any benefit to using formulas?
    return ns.fileExists("Formulas.exe", "home") ? (
        ns.formulas.hacking.weakenTime(server, player)
    ) : (
        ns.getWeakenTime(server.hostname)
        / player.mults.hacking_speed
    );
}

function getGrowTime(ns: NS, server: Server, player: Player): number {
    // TODO: Is there any benefit to using formulas?
    return ns.fileExists("Formulas.exe", "home") ? (
        ns.formulas.hacking.growTime(server, player)
    ) : (
        ns.getGrowTime(server.hostname)
        / player.mults.hacking_speed
    );
}

function getHackMoneyDecrease(ns: NS, server: Server, player: Player, hackThreads: number = 1): number {
    // TODO: Is there any benefit to using formulas?
    return (
        server.moneyAvailable
        * hackThreads
        * (ns.fileExists("Formulas.exe", "home") ? (
            ns.formulas.hacking.hackPercent(server, player)
            * ns.formulas.hacking.hackChance(server, player)
        ) : (
            ns.hackAnalyze(server.hostname)
            * player.mults.hacking_money
            * ns.hackAnalyzeChance(server.hostname)
            * player.mults.hacking_chance
        ))
    );
}

function getHackMoneyDecreaseRate(ns: NS, server: Server, player: Player, hackThreads: number = 1): number {
    return (
        getHackMoneyDecrease(ns, server, player, hackThreads)
        / getHackTime(ns, server, player)
    );
}

function calculateBatchForServer(ns: NS, server: Server, player: Player, hackThreads: number = 1): Batch {
    const weakenAmountPerThread = ns.weakenAnalyze(1);
    
    const hackSecurityIncrease = ns.hackAnalyzeSecurity(hackThreads, server.hostname);
    const postHackWeakenThreads = Math.ceil(hackSecurityIncrease / weakenAmountPerThread);

    const hackMoneyDecrease = getHackMoneyDecrease(ns, server, player, hackThreads);
    const growFactor = server.moneyAvailable / (server.moneyAvailable - hackMoneyDecrease)
    const growThreads = Math.ceil(ns.growthAnalyze(server.hostname, growFactor) / player.mults.hacking_grow);

    const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, server.hostname);
    const postGrowWeakenThreads = Math.ceil(growSecurityIncrease / weakenAmountPerThread);

    return {
        hostname: server.hostname,
        hackThreads,
        postHackWeakenThreads,
        growThreads,
        postGrowWeakenThreads,
        hackSecurityIncrease,
        hackMoneyDecrease,
    };
}

function pushWorkerFiles(ns: NS, hostname: string) {
    ns.ls("home", "/worker/").forEach(workerFile => 
        ns.scp(workerFile, hostname, "home")
    );
}

function getBestCandidateServer(ns: NS, servers: Server[], player: Player): Server {
    return servers.reduce(
        (a, b) => (
            getHackMoneyDecreaseRate(ns, a, player)
            >= getHackMoneyDecreaseRate(ns, b, player)
        ) ? a : b,     
    );
}

function root(ns: NS, hostname: string): boolean {
    const openers: [string, (hostname: string) => void][] = [
        ["BruteSSH.exe", ns.brutessh],
        ["FTPCrack.exe", ns.ftpcrack],
        ["relaySMTP.exe", ns.relaysmtp],
        ["HTTPWorm.exe", ns.httpworm],
        ["SQLInject.exe", ns.sqlinject],    
    ];
    const availableOpeners = openers.filter(
        ([filename, _]) => ns.fileExists(filename, "home"),
    ).map(
        ([_, opener]) => opener,
    );

    if (
        ns.getHackingLevel() < ns.getServerRequiredHackingLevel(hostname)
        || ns.getServerNumPortsRequired(hostname) > availableOpeners.length
    )
        return false;

    availableOpeners.forEach(opener => opener(hostname));
    ns.nuke(hostname);
    ns.toast(`Rooted ${hostname}!`);
    return true;
}

export async function main(ns: NS) {
    const player = ns.getPlayer();
    const candidateServers: Server[] = [];

    const heaviestTaskRam = Math.max(
        ns.getScriptRam("/worker/hack.js", "home"),
        ns.getScriptRam("/worker/weaken.js", "home"),
        ns.getScriptRam("/worker/grow.js", "home"),        
    );

    walkServers(
        ns,
        "home",
        (hostname: string) => {
            pushWorkerFiles(ns, hostname);

            if (!ns.hasRootAccess(hostname))
                return;

            const server = ns.getServer(hostname);

            const candidateServer = ns.formulas.mockServer();
            candidateServer.hostname = server.hostname;
            candidateServer.hackDifficulty = server.minDifficulty;
            candidateServer.minDifficulty = server.minDifficulty;
            candidateServer.moneyAvailable = server.moneyMax;
            candidateServer.moneyMax = server.moneyMax;
            candidateServer.serverGrowth = server.serverGrowth; // TODO: Necessary?

            candidateServers.push(candidateServer);
        }
    );

    ns.tprint("Calculating batches...");
    
    const batches: Batch[] = [];

    while (true) {
        const bestCandidate = getBestCandidateServer(ns, candidateServers, player);

        if (bestCandidate.moneyAvailable <= 0 || batches.length >= 10000)
            break;

        const batch = calculateBatchForServer(ns, bestCandidate, player);

        bestCandidate.moneyAvailable -= batch.hackMoneyDecrease;
        bestCandidate.hackDifficulty += batch.hackSecurityIncrease;

        batches.push(batch);
    }

    ns.tprint(`Finished calculating ${batches.length} batches!`);

    while (true) {
        await ns.sleep(800);

        let newServersRooted = false;
        const freeThreadsByHostname = new Map<string, number>();

        walkServers(
            ns,
            "home",
            (hostname: string) => {
                if (!ns.hasRootAccess(hostname)) {
                    if (!root(ns, hostname))
                        return;
                    newServersRooted = true;
                }

                // TODO: Discover and solve contracts

                const freeThreads = Math.floor(
                    (ns.getServerMaxRam(hostname) - ns.getServerUsedRam(hostname))
                    / heaviestTaskRam
                );
                if (freeThreads > 0)
                    freeThreadsByHostname.set(hostname, freeThreads);
            },
        );

        if (newServersRooted)
            ns.spawn("bitburner.js", 1, ...ns.args);

        let totalFreeThreads = [...freeThreadsByHostname.values()].reduce((a, b) => a + b, 0);
        const threadCountsByHostname = new Map<string, ThreadCounts>();

        for (const batch of batches) {
            const batchThreads = (
                batch.hackThreads
                + batch.postHackWeakenThreads
                + batch.growThreads
                + batch.postGrowWeakenThreads
            );

            if (batchThreads > totalFreeThreads)
                break;

            if (!threadCountsByHostname.has(batch.hostname))
                threadCountsByHostname.set(
                    batch.hostname,
                    {
                        hackThreads: 0,
                        postHackWeakenThreads: 0,
                        growThreads: 0,
                        postGrowWeakenThreads: 0,
                    },
                );

            const threadCounts = threadCountsByHostname.get(batch.hostname)!;
            threadCounts.hackThreads += batch.hackThreads;
            threadCounts.postHackWeakenThreads += batch.postHackWeakenThreads;
            threadCounts.growThreads += batch.growThreads;
            threadCounts.postGrowWeakenThreads += batch.postGrowWeakenThreads;

            totalFreeThreads -= batchThreads;
        };

        // TODO: Perhaps move this to a function
        const scheduleThreads = (threadCount: number, cb: (scheduledHostname: string, scheduledThreadCount: number) => void) => {
            let remainingThreadCount = threadCount;
            while (remainingThreadCount > 0) {
                const nextServer = freeThreadsByHostname.keys().next().value;
                const threadsAvailable = freeThreadsByHostname.get(nextServer)!;
                const threadsToSchedule = Math.min(remainingThreadCount, threadsAvailable);
                cb(nextServer, threadsToSchedule);
                remainingThreadCount -= threadsToSchedule;
                freeThreadsByHostname.set(nextServer, threadsAvailable - threadsToSchedule);
                if (freeThreadsByHostname.get(nextServer) == 0) {
                    freeThreadsByHostname.delete(nextServer);
                }
            }
        }
        
        for (const [hostname, threadCounts] of threadCountsByHostname.entries()) {
            const server = ns.getServer(hostname);

            const hackTime = getHackTime(ns, server, player);
            const weakenTime = getWeakenTime(ns, server, player);
            const growTime = getGrowTime(ns, server, player);

            const longestTaskTime = Math.max(hackTime, weakenTime, growTime);

            if (
                server.moneyAvailable == server.moneyMax
                && server.hackDifficulty == server.minDifficulty
            )
                scheduleThreads(
                    threadCounts.hackThreads,
                    (scheduledHostname, scheduledThreadCount) => ns.exec(
                        "/worker/hack.js",
                        scheduledHostname,
                        scheduledThreadCount,
                        "--server", hostname,
                        "--delay", longestTaskTime - hackTime,
                        ns.getTimeSinceLastAug(),
                    ),
                );
            scheduleThreads(
                threadCounts.postHackWeakenThreads,
                (scheduledHostname, scheduledThreadCount) => ns.exec(
                    "/worker/weaken.js",
                    scheduledHostname,
                    scheduledThreadCount,
                    "--server", hostname,
                    "--delay", longestTaskTime - weakenTime + 200,
                    ns.getTimeSinceLastAug(),
                ),
            );
            scheduleThreads(
                threadCounts.growThreads,
                (scheduledHostname, scheduledThreadCount) => ns.exec(
                    "/worker/grow.js",
                    scheduledHostname,
                    scheduledThreadCount,
                    "--server", hostname,
                    "--delay", longestTaskTime - growTime + 200 * 2,
                    ns.getTimeSinceLastAug(),
                ),
            );
            scheduleThreads(
                threadCounts.postGrowWeakenThreads,
                (scheduledHostname, scheduledThreadCount) => ns.exec(
                    "/worker/weaken.js",
                    scheduledHostname,
                    scheduledThreadCount,
                    "--server", hostname,
                    "--delay", longestTaskTime - weakenTime + 200 * 3,
                    ns.getTimeSinceLastAug(),
                ),
            );
        }
    }
}