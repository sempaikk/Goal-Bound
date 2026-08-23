# Run once in PowerShell to schedule daily backup at 17:00.

$BotRoot = Split-Path -Parent $PSScriptRoot
if (-not $BotRoot) { $BotRoot = (Get-Location).Path }

$taskName = "GoalBound-DB-Backup"
$action = New-ScheduledTaskAction -Execute "node" -Argument "tools/backup-db.js" -WorkingDirectory $BotRoot
$trigger = New-ScheduledTaskTrigger -Daily -At 5:00PM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "OK: task '$taskName' runs daily 17:00 in $BotRoot"
Write-Host "Test now:  schtasks /Run /TN $taskName"
Write-Host "Remove:     Unregister-ScheduledTask -TaskName $taskName -Confirm:`$false"
