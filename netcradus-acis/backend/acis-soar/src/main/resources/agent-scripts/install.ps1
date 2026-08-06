#Requires -RunAsAdministrator
<#
    ACIS Lightweight Heartbeat Agent - Windows Installer

    Registers this machine with ACIS Security by:
      1. Generating (or reusing) a local agent identity at
         C:\ProgramData\ACIS\agent_id
      2. Writing a standalone heartbeat script to
         C:\ProgramData\ACIS\heartbeat.ps1
      3. Registering a Windows Scheduled Task that runs the heartbeat
         script every minute, indefinitely, so this host keeps showing up
         in Settings > Agent Deployment as long as the machine is on.

    This is a lightweight presence/inventory agent, not a full EDR: it
    reports hostname/OS/IP on an interval and nothing else.
#>
param(
    [Parameter(Mandatory = $true)][string]$EnrollmentToken,
    [Parameter(Mandatory = $true)][string]$ServerUrl
)

$ErrorActionPreference = 'Stop'
$InstallDir = "$env:ProgramData\ACIS"
$AgentIdFile = Join-Path $InstallDir 'agent_id'
$HeartbeatScript = Join-Path $InstallDir 'heartbeat.ps1'

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

if (Test-Path $AgentIdFile) {
    $AgentId = (Get-Content $AgentIdFile -Raw).Trim()
} else {
    $AgentId = [guid]::NewGuid().ToString()
    Set-Content -Path $AgentIdFile -Value $AgentId -NoNewline
}

$HeartbeatBody = @'
$ErrorActionPreference = 'SilentlyContinue'
$AgentId = (Get-Content "C:\ProgramData\ACIS\agent_id" -Raw).Trim()
$ServerUrl = '__SERVER_URL__'
$Token = '__ENROLLMENT_TOKEN__'
$Hostname = $env:COMPUTERNAME
$Os = (Get-CimInstance Win32_OperatingSystem).Caption
$IpAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' } | Select-Object -First 1 -ExpandProperty IPAddress)

$Body = @{
    agentId     = $AgentId
    hostname    = $Hostname
    os          = $Os
    ipAddress   = $IpAddress
    agentVersion = 'acis-heartbeat-ps-1.0'
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$ServerUrl/api/agent/heartbeat" -Method Post -Body $Body -ContentType 'application/json' -Headers @{ 'X-Agent-Token' = $Token } -TimeoutSec 15 | Out-Null
} catch {
    # Best-effort: a missed heartbeat just means this host shows OFFLINE
    # until the next one succeeds — never crash the scheduled task.
}
'@

$HeartbeatBody = $HeartbeatBody.Replace('__SERVER_URL__', $ServerUrl).Replace('__ENROLLMENT_TOKEN__', $EnrollmentToken)
Set-Content -Path $HeartbeatScript -Value $HeartbeatBody

# Prove connectivity right now, before the scheduled task's first tick.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $HeartbeatScript

$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$HeartbeatScript`""
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration ([TimeSpan]::MaxValue)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'ACIS-Agent-Heartbeat' -Action $Action -Trigger $Trigger -Settings $Settings -RunLevel Highest -User 'SYSTEM' -Force | Out-Null

Write-Host "ACIS agent enrolled. Agent ID: $AgentId. Heartbeat scheduled every 60s."
