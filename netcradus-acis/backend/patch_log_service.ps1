$ErrorActionPreference = "Stop"

$jdkBin = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot\bin"
$jarExe = Join-Path $jdkBin "jar.exe"
$javacExe = Join-Path $jdkBin "javac.exe"

$backendRoot = $PSScriptRoot
$jarPath = Join-Path $backendRoot "acis-log-service\target\acis-log-service-1.0.0-SNAPSHOT.jar"
$srcFile = Join-Path $backendRoot "acis-log-service\src\main\java\com\netcradus\acis\log\controller\LogController.java"
$tempDir = Join-Path $backendRoot "patch_temp"

Write-Output "Starting hot patch compilation of LogController..."

# Clean old temp directories
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null
$extractedDir = Join-Path $tempDir "extracted"
$compiledDir = Join-Path $tempDir "compiled"
$jarUpdateDir = Join-Path $tempDir "jar_update"

New-Item -ItemType Directory -Path $extractedDir | Out-Null
New-Item -ItemType Directory -Path $compiledDir | Out-Null
New-Item -ItemType Directory -Path $jarUpdateDir | Out-Null

# 1. Extract existing jar
Write-Output "Extracting acis-log-service jar..."
Set-Location $extractedDir
& $jarExe xf $jarPath
Set-Location $backendRoot

# 2. Compile LogController.java
Write-Output "Compiling LogController.java..."
$classpath = "$extractedDir\BOOT-INF\classes;$extractedDir\BOOT-INF\lib\*"
& $javacExe -cp $classpath $srcFile -d $compiledDir

# 3. Prepare jar update folder structure
Write-Output "Preparing folder structure for JAR update..."
$targetClassDir = Join-Path $jarUpdateDir "BOOT-INF\classes"
New-Item -ItemType Directory -Path $targetClassDir | Out-Null
Copy-Item -Path "$compiledDir\com" -Destination $targetClassDir -Recurse

# 4. Update the JAR file
Write-Output "Updating JAR file..."
Set-Location $jarUpdateDir
# Update with all files inside BOOT-INF
& $jarExe uf $jarPath BOOT-INF
Set-Location $backendRoot

Write-Output "Cleaning up temp files..."
Remove-Item $tempDir -Recurse -Force

Write-Output "Hot patch completed successfully!"
