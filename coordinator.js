/** @param {NS} ns */
export async function main(ns) {
    const args = ns.flags([
        ["server", ""],
        ["batchPeriodMs", 200],
        ["minHackMoney", 1000000000],
        ["hackThreadsPerBatch", 5],
        ["ramHeadroomGb", 4],
    ]);

    const batchMemo = new Map();

    while (true) {
        await ns.sleep(args.batchPeriodMs * 4);
        
        const servers = discoverServers(ns);
        const rootedServerThreadCounts = new Map();

        for (const server of servers) {
            pushWorkerFiles(ns, server);

            if (ns.hasRootAccess(server)) {
                const threadsAvailable = Math.floor((ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - ((server == "home") ? args.ramHeadroomGb : 0)) / 1.75);                    
                if (threadsAvailable > 0) {
                    rootedServerThreadCounts.set(
                        server,
                        threadsAvailable,
                    );
                }
            } else {
                rootServer(ns, server);
            }
        }

        if (rootedServerThreadCounts.size == 0)
            continue;

        const availableThreads = Array.from(rootedServerThreadCounts.values()).reduce((a, b) => a + b);

        const scheduleThreads = (threadCount, cb) => {
            let remainingThreadCount = threadCount;
            while (remainingThreadCount > 0) {
                const nextServer = rootedServerThreadCounts.keys().next().value;
                const threadsAvailable = rootedServerThreadCounts.get(nextServer);
                const threadsToSchedule = Math.min(remainingThreadCount, threadsAvailable);
                cb(nextServer, threadsToSchedule);
                remainingThreadCount -= threadsToSchedule;
                rootedServerThreadCounts.set(nextServer, threadsAvailable - threadsToSchedule);
                if (rootedServerThreadCounts.get(nextServer) == 0) {
                    rootedServerThreadCounts.delete(nextServer);
                }
            }
        }

        if (ns.fileExists("Formulas.exe", "home")) {
            // batching
            const player = ns.getPlayer();

            const mockServers = servers.filter(
                ns.hasRootAccess,   
            ).map(
                ns.getServer,
            ).map(server => {
                const mockServer = ns.formulas.mockServer();
                mockServer.hostname = server.hostname;
                mockServer.hackDifficulty = server.minDifficulty;
                mockServer.minDifficulty = server.minDifficulty;
                mockServer.moneyAvailable = server.moneyMax;
                mockServer.moneyMax = server.moneyMax;
                mockServer.serverGrowth = server.serverGrowth;
                return mockServer;
            });

            let remainingThreads = availableThreads;

            const originalBestServer = mockServers.reduce(
                (a, b) => getHackMoneyRate(ns, a, player) >= getHackMoneyRate(ns, b, player) ? a : b,
            );

            const tasksToSchedule = new Map();

            while (remainingThreads > 0) {
                const bestServer = mockServers.reduce(
                    (a, b) => getHackMoneyRate(ns, a, player) >= getHackMoneyRate(ns, b, player) ? a : b,
                );

                if (bestServer.moneyAvailable <= args.minHackMoney)
                    break;

                if (!tasksToSchedule.has(bestServer.hostname)) {
                    tasksToSchedule.set(bestServer.hostname, {hack: 0, postHackWeaken: 0, grow: 0, postGrowWeaken: 0});
                }

                const hackSecurityIncrease = ns.hackAnalyzeSecurity(args.hackThreadsPerBatch, bestServer.hostname);
                const postHackWeakenThreads = Math.ceil(hackSecurityIncrease / ns.weakenAnalyze(1));

                const hackMoneyDecrease = getHackMoney(ns, bestServer, player) * args.hackThreadsPerBatch;
                const growThreads = Math.ceil(ns.growthAnalyze(bestServer.hostname, bestServer.moneyAvailable / (bestServer.moneyAvailable - hackMoneyDecrease)) / ns.getHackingMultipliers().growth);
                
                const postGrowWeakenThreads = Math.ceil(ns.growthAnalyzeSecurity(growThreads, bestServer.hostname) / ns.weakenAnalyze(1));

                bestServer.moneyAvailable -= hackMoneyDecrease;
                bestServer.hackDifficulty += hackSecurityIncrease;

                if (args.hackThreadsPerBatch + postHackWeakenThreads + growThreads + postGrowWeakenThreads > remainingThreads) {
                    break;
                }

                const serverTasks = tasksToSchedule.get(bestServer.hostname);
                serverTasks.hack += args.hackThreadsPerBatch;
                serverTasks.postHackWeaken += postHackWeakenThreads;
                serverTasks.grow += growThreads;
                serverTasks.postGrowWeaken += postGrowWeakenThreads;

                remainingThreads -= (args.hackThreadsPerBatch + postHackWeakenThreads + growThreads + postGrowWeakenThreads);
            }

            for (const [hostname, tasks] of tasksToSchedule.entries()) {
                const server = ns.getServer(hostname);

                const hackTime = ns.formulas.hacking.hackTime(server, player);
                const weakenTime = ns.formulas.hacking.weakenTime(server, player);
                const growTime = ns.formulas.hacking.growTime(server, player);
                
                const longestTaskTime = Math.max(
                    hackTime,
                    weakenTime,
                    growTime,
                );
                
                if (server.moneyAvailable == server.moneyMax && server.hackDifficulty == server.minDifficulty) {
                    scheduleThreads(
                        tasks.hack,
                        (scheduledServer, scheduledThreadCount) => ns.exec(
                            "/worker/hack.js",
                            scheduledServer,
                            scheduledThreadCount,
                            "--server", hostname,
                            "--delay", longestTaskTime - hackTime,
                            ns.getTimeSinceLastAug(),
                        ),
                    );
                }
                scheduleThreads(
                    tasks.postHackWeaken,
                    (scheduledServer, scheduledThreadCount) => ns.exec(
                        "/worker/weaken.js",
                        scheduledServer,
                        scheduledThreadCount,
                        "--server", hostname,
                        "--delay", longestTaskTime - weakenTime + args.batchPeriodMs,
                        ns.getTimeSinceLastAug(),
                    ),
                );
                scheduleThreads(
                    tasks.grow,
                    (scheduledServer, scheduledThreadCount) => ns.exec(
                        "/worker/grow.js",
                        scheduledServer,
                        scheduledThreadCount,
                        "--server", hostname,
                        "--delay", longestTaskTime - growTime + args.batchPeriodMs * 2,
                        ns.getTimeSinceLastAug(),
                    ),
                );
                scheduleThreads(
                    tasks.postGrowWeaken,
                    (scheduledServer, scheduledThreadCount) => ns.exec(
                        "/worker/weaken.js",
                        scheduledServer,
                        scheduledThreadCount,
                        "--server", hostname,
                        "--delay", longestTaskTime - weakenTime + args.batchPeriodMs * 3,
                        ns.getTimeSinceLastAug(),
                    ),
                );
            }
        } else {
            // suboptimal proto-batching
            const bestServer = args.server || servers.filter(
                ns.hasRootAccess,   
            ).reduce(
                (a, b) => ns.getServerMaxMoney(a) >= ns.getServerMaxMoney(b) ? a : b,
            );

            const multipliers = ns.getHackingMultipliers();
            const hackTime = ns.getHackTime(bestServer) / multipliers.speed;

            const hackPercent = ns.hackAnalyze(bestServer) * multipliers.money;

            const growThreadsPerHackThread = ns.growthAnalyze(bestServer, hackPercent < 1 ? (1 / (1 - hackPercent)) : Number.MAX_SAFE_INTEGER) / multipliers.growth * ns.getGrowTime(bestServer) / hackTime * ns.getServerMaxMoney(bestServer) * 0.75 / Math.max(ns.getServerMoneyAvailable(bestServer), 1);
            const weakenThreadsPerHackThread = ns.hackAnalyzeSecurity(1, bestServer) / ns.weakenAnalyze(1) * ns.getWeakenTime(bestServer) / hackTime * ns.getServerSecurityLevel(bestServer) / ns.getServerMinSecurityLevel(bestServer);
            const weakenThreadsPerGrowThread = ns.growthAnalyzeSecurity(1, bestServer) / ns.weakenAnalyze(1) * ns.getWeakenTime(bestServer) / ns.getGrowTime(bestServer) * ns.getServerSecurityLevel(bestServer) / ns.getServerMinSecurityLevel(bestServer);

            const normalizationTotal = 1 + growThreadsPerHackThread + weakenThreadsPerHackThread + growThreadsPerHackThread * weakenThreadsPerGrowThread;

            let hackThreads = Math.floor(1 / normalizationTotal * availableThreads);
            let growThreads = Math.floor(growThreadsPerHackThread / normalizationTotal * availableThreads);
            let weakenThreads = Math.floor((weakenThreadsPerHackThread + growThreadsPerHackThread * weakenThreadsPerGrowThread) / normalizationTotal * availableThreads);

            // ns.tprint(`Hacking ${bestServer} (money=${ns.getServerMoneyAvailable(bestServer) / ns.getServerMaxMoney(bestServer)}, security=${ns.getServerMinSecurityLevel(bestServer) / ns.getServerSecurityLevel(bestServer)}) with ${hackThreads} hack threads, ${growThreads} grow threads, ${weakenThreads} weaken threads.`);

            const growDelay = ns.getWeakenTime(bestServer) - ns.getGrowTime(bestServer) - 200;
            const hackDelay = ns.getWeakenTime(bestServer) - hackTime + 200;

            while (hackThreads > 0) {
                const nextServer = rootedServerThreadCounts.keys().next().value;
                const threadsAvailable = rootedServerThreadCounts.get(nextServer);
                const threadsToSchedule = Math.min(hackThreads, threadsAvailable);
                ns.exec("/worker/hack.js", nextServer, threadsToSchedule, "--server", bestServer, /*"--delay", hackDelay,*/ ns.getTimeSinceLastAug());
                hackThreads -= threadsToSchedule;
                rootedServerThreadCounts.set(nextServer, threadsAvailable - threadsToSchedule);
                if (rootedServerThreadCounts.get(nextServer) == 0) {
                    rootedServerThreadCounts.delete(nextServer);
                }
            }

            while (growThreads > 0) {
                const nextServer = rootedServerThreadCounts.keys().next().value;
                const threadsAvailable = rootedServerThreadCounts.get(nextServer);
                const threadsToSchedule = Math.min(growThreads, threadsAvailable);
                ns.exec("/worker/grow.js", nextServer, threadsToSchedule, "--server", bestServer, /*"--delay", growDelay,*/ ns.getTimeSinceLastAug());
                growThreads -= threadsToSchedule;
                rootedServerThreadCounts.set(nextServer, threadsAvailable - threadsToSchedule);
                if (rootedServerThreadCounts.get(nextServer) == 0) {
                    rootedServerThreadCounts.delete(nextServer);
                }
            }

            while (weakenThreads > 0) {
                const nextServer = rootedServerThreadCounts.keys().next().value;
                const threadsAvailable = rootedServerThreadCounts.get(nextServer);
                const threadsToSchedule = Math.min(weakenThreads, threadsAvailable);
                ns.exec("/worker/weaken.js", nextServer, threadsToSchedule, "--server", bestServer, ns.getTimeSinceLastAug());
                weakenThreads -= threadsToSchedule;
                rootedServerThreadCounts.set(nextServer, threadsAvailable - threadsToSchedule);
                if (rootedServerThreadCounts.get(nextServer) == 0) {
                    rootedServerThreadCounts.delete(nextServer);
                }
            }
        }
    }
}

function pushWorkerFiles(ns, server, force = false) {
    for (const filename of ns.ls("home", "/worker/")) {
        if(!ns.fileExists(filename, server) || force)
            ns.scp(filename, server, "home");
    }
}

/** @param {NS} ns */
function discoverServers(ns) {
    const servers = new Set();
    const queue = ["home"];
    while (queue.length > 0) {
        const server = queue.pop();
        if (servers.has(server))
            continue;
        queue.push(...ns.scan(server));
        servers.add(server);
    }
    return Array.from(servers);
}

/** @param {NS} ns */
function getHackMoney(ns, server, player) {
    return (
        server.moneyAvailable
        * ns.formulas.hacking.hackPercent(server, player)
        * ns.formulas.hacking.hackChance(server, player)
    );
}

/** @param {NS} ns */
function getHackMoneyRate(ns, server, player) {
    return (
        getHackMoney(ns, server, player)
        / ns.formulas.hacking.hackTime(server, player)
    );
}

/** @param {NS} ns */
function getAvailableOpeners(ns) {
    return [
        ["BruteSSH.exe", ns.brutessh],
        ["FTPCrack.exe", ns.ftpcrack],
        ["relaySMTP.exe", ns.relaysmtp],
        ["HTTPWorm.exe", ns.httpworm],
        ["SQLInject.exe", ns.sqlinject],    
    ].filter(
        ([filename, _]) => ns.fileExists(filename, "home"),
    ).map(
        ([_, opener]) => opener,
    );
}

/** @param {NS} ns */
function rootServer(ns, server) {
    const availableOpeners = getAvailableOpeners(ns);
    if (
        ns.getHackingLevel() >= ns.getServerRequiredHackingLevel(server) &&
        ns.getServerNumPortsRequired(server) <= availableOpeners.length
    ) {
        for (const opener of availableOpeners) {
            opener(server);
        }
        ns.nuke(server);
        ns.toast(`Rooted ${server}.`);
    }
}
