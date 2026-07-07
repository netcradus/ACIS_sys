$backendRoot = $PSScriptRoot

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

$processes = @()

foreach ($s in $services) {
    $jarFullPath = Join-Path $backendRoot $s.Jar
    if (Test-Path $jarFullPath) {
        Write-Output "Starting service: $($s.Name)"
        $outLog = Join-Path $backendRoot "$($s.Name)-out.log"
        $errLog = Join-Path $backendRoot "$($s.Name)-err.log"
        # Delete old logs if any
        Remove-Item $outLog -ErrorAction SilentlyContinue
        Remove-Item $errLog -ErrorAction SilentlyContinue
        
        $p = Start-Process java -NoNewWindow -WorkingDirectory $backendRoot -ArgumentList "-Xms128m", "-Xmx256m", "-jar", "`"$jarFullPath`"" -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
        $processes += $p
    } else {
        Write-Output "Skipping service: $($s.Name) - JAR not found"
    }
}

Write-Output "All services launched. Monitoring processes..."

# Loop and check if processes are still running every 10 seconds to keep task alive
while ($true) {
    $alive = @()
    $dead = @()
    foreach ($p in $processes) {
        if (-not $p.HasExited) {
            $alive += $p.ProcessName
        } else {
            $dead += $p.ProcessName
        }
    }
    Write-Output "$(Get-Date -Format 'HH:mm:ss') - $($alive.Count) services running."
    if ($alive.Count -eq 0) {
        Write-Output "All services have exited."
        break
    }
    Start-Sleep -Seconds 10
}
