/** @param {NS} ns */
export async function main(ns) {
    const args = ns.flags([
        ["minimumCash", 25000000],
        ["minimumSellProfit", 1200000],
    ]);

    while (true) {
        await ns.sleep(4 * 1000);

        const symbols = ns.stock.getSymbols();

        const bestSymbol = symbols.filter(symbol => {
            const [shares, _averagePosition, _sharesShort, _averagePositionShort] = ns.stock.getPosition(symbol);
            return shares != ns.stock.getMaxShares(symbol);
        }).reduce(
            (a, b) => ns.stock.getForecast(a) >= ns.stock.getForecast(b) ? a : b,
        );

        let sold = false;

        for (const symbol of symbols) {
            const [shares, averagePosition, _sharesShort, _averagePositionShort] = ns.stock.getPosition(symbol);

            if (shares == 0)
                continue;
            
            if (ns.stock.getForecast(symbol) < 0.5) {
                ns.stock.sellStock(symbol, shares);
                sold = true;
                continue;
            }

            if(shares * (ns.stock.getBidPrice(symbol) - averagePosition) >= args.minimumSellProfit || symbol != bestSymbol)
            {
                ns.stock.sellStock(symbol, shares);
                sold = true;
                continue;
            }
        }

        if (sold)
            continue;
        
        if (ns.getPlayer().money >= args.minimumCash + 100000) {
            const [shares, _averagePosition, _sharesShort, _averagePositionShort] = ns.stock.getPosition(bestSymbol);
            const sharesToBuy = (ns.getPlayer().money - args.minimumCash) / ns.stock.getAskPrice(bestSymbol);
            ns.stock.buyStock(
                bestSymbol,
                Math.min(
                    sharesToBuy,
                    ns.stock.getMaxShares(bestSymbol) - sharesToBuy,
                ),
            );
        }
    }
}