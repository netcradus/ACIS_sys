$backendRoot = $PSScriptRoot

function Start-ServiceWindow {
    param(
        [string]$ServiceName,
        [string]$JarPath
    )

    $command = @"
Set-Location '$backendRoot'
`$Host.UI.RawUI.WindowTitle = '$ServiceName'
java -jar '$JarPath'
"@

    Start-Process powershell `
        -WorkingDirectory $backendRoot `
        -ArgumentList "-NoExit", "-Command", $command
}

Start-ServiceWindow -ServiceName "acis-gateway" -JarPath "acis-gateway\target\acis-gateway-1.0.0-SNAPSHOT.jar"
Start-ServiceWindow -ServiceName "acis-log-service" -JarPath "acis-log-service\target\acis-log-service-1.0.0-SNAPSHOT.jar"
Start-ServiceWindow -ServiceName "acis-alerts" -JarPath "acis-alerts\target\acis-alerts-1.0.0-SNAPSHOT.jar"
Start-ServiceWindow -ServiceName "acis-asset-service" -JarPath "acis-asset-service\target\acis-asset-service-1.0.0-SNAPSHOT.jar"
Start-ServiceWindow -ServiceName "acis-threat-service" -JarPath "acis-threat-service\target\acis-threat-service-1.0.0-SNAPSHOT.jar"
Start-ServiceWindow -ServiceName "acis-correlation" -JarPath "acis-correlation\target\acis-correlation-1.0.0-SNAPSHOT.jar"
Start-ServiceWindow -ServiceName "acis-ingestion" -JarPath "acis-ingestion\target\acis-ingestion-1.0.0-SNAPSHOT.jar"
Start-ServiceWindow -ServiceName "acis-soar" -JarPath "acis-soar\target\acis-soar-1.0.0-SNAPSHOT.jar"
