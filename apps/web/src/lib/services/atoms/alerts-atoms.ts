import { MapleApiAtomClient } from "@/lib/services/common/atom-client"

// Module-level singletons. `AtomHttpApi.query` keys its `Atom.family` by the
// request object, and the `reactivityKeys` array compares by reference — so
// every consumer must import these exact atoms to share one fetch rather than
// each minting its own with a fresh array literal.
export const listIncidentsAtom = MapleApiAtomClient.query("alerts", "listIncidents", {
	reactivityKeys: ["alertIncidents"],
})

export const listRulesAtom = MapleApiAtomClient.query("alerts", "listRules", {
	reactivityKeys: ["alertRules"],
})
