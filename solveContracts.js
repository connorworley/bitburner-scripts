/** @param {NS} ns */
export async function main(ns) {
    for (const typ of ns.codingcontract.getContractTypes()) {
        ns.codingcontract.createDummyContract(typ);
    }
}