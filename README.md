# FormationHub Synthetic Monitor

Automated health check that runs the **full LLC sign-up funnel** on
`formationhub.com` every 15 minutes and reports the result to Slack.

## What it checks (real end-to-end flow)
1. Home page loads and the **state dropdown** is present
2. Selects a state (`config.json` → `state`) and clicks **Start Application**
3. Fills the **entire application form** — business name, activity + dependent
   "Specific Products/Services" dropdown, representative info, address,
   physical/mailing address, management, member #1, all Yes/No questions,
   and the **agreement checkbox**
4. Clicks **Continue** (waits for the form auto-save first)
5. Validates it reached **`/checkout`** with a working **Stripe payment form**
   (card-number field + "Submit Application" button)

> **No payment is ever submitted** — the check stops at the rendered payment form.
> Each run creates one abandoned draft order named
> `ZZ MONITORING TEST - DO NOT PROCESS <digits>` so your team can filter them out.

## Files
| File | Purpose |
|------|---------|
| `monitor.js` | The check. Exit 0 = healthy, 1 = problem. |
| `config.json` | URL, state, Slack webhook, test data, notify mode. |
| `run-monitor.cmd` | Wrapper the scheduled task runs. |
| `monitor.log` | Append-only result log (one line per run). |
| `task-run.log` | Raw stdout captured by Task Scheduler. |
| `screenshots/` | Full-page screenshot saved on every failure. |

## Run manually
```
node monitor.js
```

## Slack notifications
Put an **Incoming Webhook** URL in `config.json` → `slackWebhookUrl`.
- `notifyOn: "always"` — posts on every run (healthy + problem)
- `notifyOn: "failure"` — posts only when something breaks

## Scheduling (Windows Task Scheduler)
Task name: **FormationHub Monitor**, repeats every 15 minutes, runs as **SYSTEM**
(`Interactive/Background`) — i.e. **24/7, whether or not anyone is logged on**.
No stored password is needed.

Because it runs as SYSTEM (which can't see browsers in a user profile), Chromium is
installed inside the project at `ms-playwright/`, and `run-monitor.cmd` sets
`PLAYWRIGHT_BROWSERS_PATH` to point there. Keep that folder.

```
schtasks /Query  /TN "FormationHub Monitor" /V /FO LIST   # status / next run
```
Managing the task (the SYSTEM task needs an **elevated/admin** prompt to Run/Change/Delete):
```
schtasks /Run    /TN "FormationHub Monitor"            # run now
schtasks /Change /TN "FormationHub Monitor" /DISABLE   # pause
schtasks /Change /TN "FormationHub Monitor" /ENABLE    # resume
schtasks /Delete /TN "FormationHub Monitor" /F         # remove
```
To re-apply the 24/7 SYSTEM setup (e.g. after moving the folder), run
**`setup-247.ps1` as Administrator**.
