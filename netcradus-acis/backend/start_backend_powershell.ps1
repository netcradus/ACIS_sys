$backendRoot = $PSScriptRoot

function Start-ServiceWindow {
    param(
        [string]$ServiceName,
        [string]$JarPath
    )

    Write-Output "Launching $ServiceName in background..."
    $outLog = Join-Path $backendRoot "$ServiceName-out.log"
    $errLog = Join-Path $backendRoot "$ServiceName-err.log"
    Start-Process java -NoNewWindow -WorkingDirectory $backendRoot -ArgumentList "-Xms128m", "-Xmx256m", "-jar", "`"$JarPath`"" -RedirectStandardOutput $outLog -RedirectStandardError $errLog
}

$services = @(
    @{ Name = "acis-gateway"; Jar = "acis-gateway\target\acis-gateway-1.0.0-SNAPSHOT.jar" },
    @{ Name = "acis-log-service"; Jar = "acis-log-service\target\acis-log-service-1.0.0-SNAPSHOT.jar" },
    @{ Name = "acis-alerts"; Jar = "acis-alerts\target\acis-alerts-1.0.0-SNAPSHOT.jar" },
    @{ Name = "acis-asset-service"; Jar = "acis-asset-service\target\acis-asset-service-1.0.0-SNAPSHOT.jar" },
    @{ Name = "acis-threat-service"; Jar = "acis-threat-service\target\acis-threat-service-1.0.0-SNAPSHOT.jar" },
    @{ Name = "acis-correlation"; Jar = "acis-correlation\target\acis-correlation-1.0.0-SNAPSHOT.jar" },
    @{ Name = "acis-ingestion"; Jar = "acis-ingestion\target\acis-ingestion-1.0.0-SNAPSHOT.jar" },
    @{ Name = "acis-soar"; Jar = "acis-soar\target\acis-soar-1.0.0-SNAPSHOT.jar" }
)

foreach ($s in $services) {
    $jarFullPath = Join-Path $backendRoot $s.Jar
    if (Test-Path $jarFullPath) {
        Write-Output "Starting service: $($s.Name) with JAR $jarFullPath"
        Start-ServiceWindow -ServiceName $s.Name -JarPath $jarFullPath
    } else {
        Write-Output "Skipping service: $($s.Name) - JAR not found at $jarFullPath"
    }
}
