$workspaceRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not (Get-Command code -ErrorAction SilentlyContinue)) {
    Write-Host "VS Code CLI 'code' is not available in PATH."
    Write-Host "Open the folder in VS Code and run the task: Start All Backend Services"
    exit 1
}

Start-Process code -ArgumentList "`"$workspaceRoot`"", "--reuse-window"

Write-Host "VS Code opened for: $workspaceRoot"
Write-Host "Run the task: Terminal > Run Task > Start All Backend Services"
