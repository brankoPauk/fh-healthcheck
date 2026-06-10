# Recreates the FormationHub Monitor task to run as SYSTEM (24/7, runs whether logged on or not).
# Must run elevated (as Administrator). Writes its result to setup-247.log.
$log = "C:\Users\brank\Desktop\fhub\setup-247.log"
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting 24/7 setup..." | Out-File $log -Encoding utf8

try {
  schtasks /Delete /TN "FormationHub Monitor" /F 2>&1 | Out-File $log -Append -Encoding utf8
  $create = schtasks /Create /TN "FormationHub Monitor" `
    /TR "C:\Users\brank\Desktop\fhub\run-monitor.cmd" `
    /SC MINUTE /MO 15 /RU "SYSTEM" /RL HIGHEST /F 2>&1
  $create | Out-File $log -Append -Encoding utf8
  schtasks /Query /TN "FormationHub Monitor" /FO LIST /V 2>&1 |
    Select-String -Pattern "TaskName|Run As User|Logon Mode|Repeat: Every|Scheduled Task State|Next Run" |
    Out-File $log -Append -Encoding utf8
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] DONE." | Out-File $log -Append -Encoding utf8
} catch {
  "ERROR: $_" | Out-File $log -Append -Encoding utf8
}
