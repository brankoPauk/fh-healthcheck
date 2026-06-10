@echo off
REM FormationHub synthetic monitor — runs the full checkout flow and reports to Slack + monitor.log
REM Browsers live inside the project so the SYSTEM account (24/7 task) can find them.
set "PLAYWRIGHT_BROWSERS_PATH=C:\Users\brank\Desktop\fhub\ms-playwright"
cd /d "C:\Users\brank\Desktop\fhub"
"C:\Program Files\nodejs\node.exe" monitor.js >> "C:\Users\brank\Desktop\fhub\task-run.log" 2>&1
