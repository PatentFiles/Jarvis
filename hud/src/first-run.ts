import type { AgentState, HudState } from "./state-server.js";

/**
 * A brand-new office has no activity and six offline agents, and every panel
 * read "OFFLINE / No signal" until the first scheduled run — which for a
 * default install is the 08:00 morning brief, so an evening buyer stared at a
 * dead-looking dashboard all night. Two customers emailed support about it
 * (support/BUGS.md: Kevin Dunn and Poran Singh, 2026-08-09). Dimmed OFFLINE
 * cards still read as "locked out", so a first-run card stands by at full
 * brightness instead.
 *
 * The wording deliberately does not promise a brief the buyer may not have
 * enabled — setup asks before registering the schedule — it states when the
 * brief runs, and that chat works right now.
 */
export const DEFAULT_AGENT_NOTE = "No signal";

export const FIRST_RUN_HINT =
  "Your office is ready. Chat with JARVIS below right now. "
  + "Your staff report here after their first scheduled run; the morning brief runs at 08:00 if you turned it on in setup.";

export const FIRST_RUN_STATUS = "STANDING BY";

/** True while the dashboard has never received a single real signal. */
export function isFirstRun(state: Pick<HudState, "agents" | "activity">): boolean {
  if (state.activity.length > 0) return false;
  return Object.values(state.agents).every(
    (agent) => agent.status === "offline" && isUntouchedNote(agent.note),
  );
}

/**
 * Whether a panel gets the first-run presentation. Only untouched defaults
 * qualify, so a real status a staff member has reported is never overwritten
 * by an explainer.
 */
export function isStandingBy(agent: Pick<AgentState, "status" | "note">, firstRun: boolean): boolean {
  return firstRun && agent.status === "offline" && isUntouchedNote(agent.note);
}

export function agentNote(agent: Pick<AgentState, "status" | "note">, firstRun: boolean): string {
  return isStandingBy(agent, firstRun) ? "Ready - chat with JARVIS below now" : agent.note;
}

function isUntouchedNote(note: string): boolean {
  return note.trim() === "" || note.trim() === DEFAULT_AGENT_NOTE;
}
