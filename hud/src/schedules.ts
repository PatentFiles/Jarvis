import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { engineHostEnvironment } from "@jarvis/setup/engine";
import { gatewayCommand } from "./gateway.js";
import { CRON_JOB_ROLES, cronJobRole } from "./history.js";
import { HUD_AGENT_ROLES, type AgentRole } from "./state-server.js";

export type Repeat = "daily" | "weekdays" | "weekly";

/** `day` is 0 (Sunday) to 6 and only matters for "weekly". */
export interface ScheduleTime {
  repeat: Repeat;
  hour: number;
  minute: number;
  day: number;
}

export interface ScheduleRow {
  id: string;
  role: AgentRole;
  name: string;
  when: string;
  /** Absent when the job runs on a pattern the picker cannot show (hourly, intervals). */
  time?: ScheduleTime;
  enabled: boolean;
  lastRunAt?: string;
  lastStatus?: string;
  delivery: string;
  /** Shipped with JARVIS: can be switched off, never deleted. */
  pinned: boolean;
}

export interface SchedulesView {
  ok: boolean;
  jobs: ScheduleRow[];
  slack: boolean;
  error?: string;
}

export type ScheduleChange =
  | { action: "toggle"; id: string; enabled: boolean }
  | { action: "time"; id: string; time: ScheduleTime }
  | { action: "create"; role: AgentRole; name: string; prompt: string; time: ScheduleTime; delivery: "hud" | "slack" }
  | { action: "delete"; id: string };

/** Runs `hermes -p jarvis cron <args>` and resolves with its output. */
export type RunCron = (args: string[]) => Promise<string>;

interface StoredJob {
  id?: unknown;
  name?: unknown;
  schedule?: { expr?: unknown };
  schedule_display?: unknown;
  enabled?: unknown;
  last_run_at?: unknown;
  last_status?: unknown;
  deliver?: unknown;
}

/** A refusal whose message is safe to show the customer as is. */
class Refusal extends Error {}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PINNED_LABELS: Readonly<Record<string, string>> = {
  "morning-brief": "Morning brief",
  "triage-inbox": "Inbox triage",
  "roas-report": "Ad performance report",
  "weekly-sweep": "Weekly research sweep",
  "write-hooks": "Content ideas",
};

const ROLE_PREFIX = new RegExp(`^(${HUD_AGENT_ROLES.join("|")}): `, "i");

const pad = (value: number): string => String(value).padStart(2, "0");
const title = (role: AgentRole): string => role.charAt(0).toUpperCase() + role.slice(1);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function cronFor(time: ScheduleTime): string {
  const { repeat, hour, minute, day } = time;
  const valid = Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59;
  if (!valid || (repeat === "weekly" && !(Number.isInteger(day) && day >= 0 && day <= 6))) {
    throw new Refusal("That time is not valid.");
  }
  const weekday = repeat === "daily" ? "*" : repeat === "weekdays" ? "1-5" : String(day);
  return `${minute} ${hour} * * ${weekday}`;
}

export function timeFromCron(expr: string): ScheduleTime | undefined {
  const match = /^(\d{1,2}) (\d{1,2}) \* \* (\*|1-5|[0-7])$/.exec(expr.trim());
  if (match === null) return undefined;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute > 59 || hour > 23) return undefined;
  if (match[3] === "*") return { repeat: "daily", hour, minute, day: 1 };
  if (match[3] === "1-5") return { repeat: "weekdays", hour, minute, day: 1 };
  return { repeat: "weekly", hour, minute, day: Number(match[3]) % 7 };
}

export function describeTime(time: ScheduleTime): string {
  const at = `${pad(time.hour)}:${pad(time.minute)}`;
  if (time.repeat === "daily") return `daily at ${at}`;
  if (time.repeat === "weekdays") return `weekdays at ${at}`;
  return `weekly on ${DAYS[time.day]} at ${at}`;
}

function toRow(job: StoredJob): ScheduleRow {
  const name = text(job.name);
  const expr = text(job.schedule?.expr);
  const time = timeFromCron(expr);
  const deliver = text(job.deliver);
  const pinned = Object.hasOwn(CRON_JOB_ROLES, name);
  return {
    id: text(job.id),
    role: cronJobRole(name) ?? "jarvis",
    name: (pinned ? PINNED_LABELS[name] : undefined) ?? (name.replace(ROLE_PREFIX, "") || "Scheduled task"),
    when: time !== undefined
      ? describeTime(time)
      : expr === "0 * * * *" ? "every hour" : text(job.schedule_display) || expr || "custom schedule",
    ...(time === undefined ? {} : { time }),
    enabled: job.enabled !== false,
    ...(text(job.last_run_at) === "" ? {} : { lastRunAt: text(job.last_run_at) }),
    ...(text(job.last_status) === "" ? {} : { lastStatus: text(job.last_status) }),
    delivery: deliver === "" || deliver === "local" ? "the HUD" : deliver.startsWith("slack") ? "Slack" : deliver,
    pinned,
  };
}

function readJobs(profileDir: string): StoredJob[] {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(profileDir, "cron", "jobs.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const jobs = (JSON.parse(raw) as { jobs?: unknown }).jobs;
  return Array.isArray(jobs) ? (jobs as StoredJob[]).filter((job) => text(job?.id) !== "") : [];
}

function slackConfigured(profileDir: string): boolean {
  try {
    const env = fs.readFileSync(path.join(profileDir, ".env"), "utf8");
    return /^\s*SLACK_BOT_TOKEN\s*=\s*"?[^"\s]+/m.test(env);
  } catch {
    return false;
  }
}

export function listSchedules(profileDir: string): SchedulesView {
  const slack = slackConfigured(profileDir);
  try {
    return { ok: true, jobs: readJobs(profileDir).map(toRow), slack };
  } catch {
    return { ok: false, jobs: [], slack, error: "Your schedules could not be read. Try again in a moment." };
  }
}

export function ownerPrompt(role: AgentRole, task: string, delivery: "hud" | "slack"): string {
  const who = role === "jarvis" ? "" : `${title(role)} handles this task. `;
  const hud = delivery === "hud"
    ? ` When you finish, if the hud tools are available, call mcp_hud_hud_post_activity with role "${role}" and a one-line summary of the result.`
    : "";
  return `${who}${task.trim()}${hud}`;
}

/**
 * Every write goes through the engine's own `cron` command, the same writer setup
 * uses, so the file keeps the engine's lock, atomic replace and next-run maths.
 * That command exits 0 even when it refuses, so success is read back from the file.
 */
export async function applyScheduleChange(profileDir: string, change: ScheduleChange, run: RunCron): Promise<SchedulesView> {
  try {
    const before = readJobs(profileDir);
    const find = (jobs: StoredJob[], id: string): StoredJob | undefined => jobs.find((job) => job.id === id);
    let args: string[];
    let landed: (after: StoredJob[]) => boolean;

    if (change.action === "create") {
      const name = change.name.trim();
      const task = change.prompt.trim();
      if (name === "" || task === "" || !HUD_AGENT_ROLES.includes(change.role)) throw new Refusal("Give the schedule a name and say what to do.");
      const expr = cronFor(change.time);
      const fullName = `${title(change.role)}: ${name}`;
      const known = new Set(before.map((job) => job.id));
      args = ["create", "--name", fullName, "--deliver", change.delivery === "slack" ? "slack" : "local", "--", expr, ownerPrompt(change.role, task, change.delivery)];
      landed = (after) => after.some((job) => !known.has(job.id) && job.name === fullName);
    } else {
      const job = find(before, change.id);
      if (job === undefined) throw new Refusal("That schedule is no longer there.");
      if (change.action === "toggle") {
        args = [change.enabled ? "resume" : "pause", change.id];
        landed = (after) => (find(after, change.id)?.enabled !== false) === change.enabled;
      } else if (change.action === "time") {
        const expr = cronFor(change.time);
        args = ["edit", change.id, "--schedule", expr, "--repeat", "0"];
        landed = (after) => find(after, change.id)?.schedule?.expr === expr;
      } else {
        if (Object.hasOwn(CRON_JOB_ROLES, text(job.name))) throw new Refusal("Schedules that came with JARVIS can be switched off, not deleted.");
        args = ["remove", change.id];
        landed = (after) => find(after, change.id) === undefined;
      }
    }

    const output = await run(args);
    if (!landed(readJobs(profileDir))) throw new Error(`cron ${args[0]} did not take effect: ${output.trim().slice(-400)}`);
    return listSchedules(profileDir);
  } catch (error) {
    if (!(error instanceof Refusal)) console.warn("schedules:", error);
    const message = error instanceof Refusal ? error.message : "JARVIS could not save that change. Try again in a moment.";
    return { ...listSchedules(profileDir), ok: false, error: message };
  }
}

export function cronRunner(hermesRoot: string, platform: NodeJS.Platform = process.platform): RunCron {
  return (args) => new Promise((resolve, reject) => {
    const command = gatewayCommand(hermesRoot, platform);
    if (command === undefined) {
      reject(new Error(`no engine under ${hermesRoot}`));
      return;
    }
    execFile(
      command.executable,
      [...command.args, "-p", "jarvis", "cron", ...args],
      { env: engineHostEnvironment(hermesRoot, { platform }), timeout: 60_000, windowsHide: true },
      (error, stdout, stderr) => (error === null ? resolve(`${stdout}${stderr}`) : reject(error)),
    );
  });
}
