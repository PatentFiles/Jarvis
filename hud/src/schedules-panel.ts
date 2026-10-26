import type { Repeat, ScheduleChange, ScheduleRow, SchedulesView, ScheduleTime } from "./schedules.js";
import type { AgentRole } from "./state-server.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SAVED = "Saved. JARVIS picks up the change within a minute.";

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element as T;
};

const dialog = byId<HTMLDialogElement>("schedules-dialog");
const status = byId<HTMLParagraphElement>("schedules-status");
const list = byId<HTMLDivElement>("schedules-list");
const form = byId<HTMLFormElement>("schedule-new");
const roleSelect = byId<HTMLSelectElement>("schedule-role");
const nameInput = byId<HTMLInputElement>("schedule-name");
const promptInput = byId<HTMLTextAreaElement>("schedule-prompt");
const deliverySelect = byId<HTMLSelectElement>("schedule-delivery");
const slackOption = deliverySelect.querySelector<HTMLOptionElement>('option[value="slack"]');
const newTime = timePicker({ repeat: "daily", hour: 8, minute: 0, day: 1 });
byId<HTMLDivElement>("schedule-new-time").replaceChildren(newTime.element);

let busy = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className !== "") element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = el("button", `text-btn small ${className}`.trim(), label);
  element.type = "button";
  element.addEventListener("click", onClick);
  return element;
}

function say(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function timePicker(initial: ScheduleTime): { element: HTMLElement; read(): ScheduleTime | undefined } {
  const wrap = el("div", "schedule-picker");
  const repeat = el("select", "");
  repeat.setAttribute("aria-label", "How often");
  for (const [value, label] of [["daily", "Every day"], ["weekdays", "Weekdays"], ["weekly", "Once a week"]]) {
    repeat.append(new Option(label, value, value === initial.repeat, value === initial.repeat));
  }
  const day = el("select", "");
  day.setAttribute("aria-label", "Day");
  [1, 2, 3, 4, 5, 6, 0].forEach((index) => day.append(new Option(`on ${DAY_NAMES[index]}`, String(index), index === initial.day, index === initial.day)));
  const time = el("input", "");
  time.type = "time";
  time.required = true;
  time.setAttribute("aria-label", "Time");
  time.value = `${String(initial.hour).padStart(2, "0")}:${String(initial.minute).padStart(2, "0")}`;
  const syncDay = (): void => { day.hidden = repeat.value !== "weekly"; };
  repeat.addEventListener("change", syncDay);
  syncDay();
  wrap.append(repeat, day, el("span", "schedule-at", "at"), time);
  return {
    element: wrap,
    read: () => {
      const match = /^(\d{2}):(\d{2})/.exec(time.value);
      if (match === null) return undefined;
      return { repeat: repeat.value as Repeat, hour: Number(match[1]), minute: Number(match[2]), day: Number(day.value) };
    },
  };
}

function lastRun(row: ScheduleRow): string {
  if (row.lastRunAt === undefined) return "not run yet";
  const at = new Date(row.lastRunAt);
  const when = Number.isNaN(at.getTime())
    ? row.lastRunAt
    : at.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `last ran ${when}${row.lastStatus === "error" ? " (did not complete)" : ""}`;
}

function renderRow(row: ScheduleRow): HTMLElement {
  const item = el("article", `schedule${row.enabled ? "" : " off"}`);
  const head = el("div", "schedule-head");
  const toggle = el("input", "");
  toggle.type = "checkbox";
  toggle.checked = row.enabled;
  toggle.setAttribute("aria-label", row.name);
  toggle.addEventListener("change", () => {
    void apply({ action: "toggle", id: row.id, enabled: toggle.checked });
  });
  const onOff = el("label", "schedule-switch", row.enabled ? "ON" : "OFF");
  onOff.append(toggle);
  head.append(el("span", "schedule-role", row.role.toUpperCase()), el("h3", "", row.name), onOff);

  const meta = el("p", "schedule-meta", `${row.when} - sent to ${row.delivery} - ${lastRun(row)}`);
  const actions = el("div", "schedule-actions");
  const showActions = (): void => {
    const remove = button("DELETE", "danger", () => {
      if (remove.dataset.armed === "1") {
        void apply({ action: "delete", id: row.id });
        return;
      }
      remove.dataset.armed = "1";
      remove.textContent = "CONFIRM DELETE";
    });
    actions.replaceChildren(button("CHANGE TIME", "", showPicker), ...(row.pinned ? [] : [remove]));
  };
  const showPicker = (): void => {
    const picker = timePicker(row.time ?? { repeat: "daily", hour: 8, minute: 0, day: 1 });
    const save = button("SAVE", "primary", () => {
      const time = picker.read();
      if (time === undefined) say("Pick a time first.", true);
      else void apply({ action: "time", id: row.id, time });
    });
    actions.replaceChildren(picker.element, save, button("CANCEL", "", showActions));
  };
  showActions();
  item.append(head, meta, actions);
  return item;
}

function render(view: SchedulesView): void {
  list.replaceChildren(...view.jobs.map(renderRow));
  if (view.jobs.length === 0) list.append(el("p", "schedule-meta", "No schedules yet. Add one below."));
  if (slackOption !== null) slackOption.hidden = slackOption.disabled = !view.slack;
  if (!view.slack) deliverySelect.value = "hud";
}

async function apply(change: ScheduleChange): Promise<boolean> {
  if (busy || window.jarvis === undefined) return false;
  busy = true;
  dialog.setAttribute("aria-busy", "true");
  say("Saving...");
  const view = await window.jarvis.changeSchedule(change).catch((): SchedulesView | undefined => undefined);
  busy = false;
  dialog.removeAttribute("aria-busy");
  if (view === undefined) {
    say("JARVIS could not save that change. Try again in a moment.", true);
    return false;
  }
  render(view);
  say(view.ok ? SAVED : view.error ?? "", !view.ok);
  return view.ok;
}

async function open(): Promise<void> {
  if (window.jarvis === undefined) return;
  say("Reading your schedules...");
  list.replaceChildren();
  dialog.showModal();
  const view = await window.jarvis.listSchedules().catch((): SchedulesView | undefined => undefined);
  if (view === undefined) {
    say("Your schedules could not be read. Try again in a moment.", true);
    return;
  }
  render(view);
  say(view.ok ? "" : view.error ?? "", !view.ok);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const time = newTime.read();
  if (time === undefined) {
    say("Pick a time first.", true);
    return;
  }
  void apply({
    action: "create",
    role: roleSelect.value as AgentRole,
    name: nameInput.value,
    prompt: promptInput.value,
    time,
    delivery: deliverySelect.value === "slack" ? "slack" : "hud",
  }).then((saved) => {
    if (!saved) return;
    nameInput.value = "";
    promptInput.value = "";
  });
});

byId<HTMLButtonElement>("schedules-close").addEventListener("click", () => dialog.close());

if (window.jarvis?.listSchedules === undefined) {
  byId<HTMLDivElement>("schedules-field").hidden = true;
} else {
  byId<HTMLButtonElement>("schedules-open").addEventListener("click", () => {
    void open();
  });
}
