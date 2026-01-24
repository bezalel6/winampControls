# Sync winampControls to Vencord userplugins
# Run this script after making changes to copy files to Vencord

$source = "C:\Users\bezal\.claude-worktrees\winampControls\quirky-wiles"
$dest = "C:\Users\bezal\Documents\Vencord\src\userplugins\winampControls"

# Files and folders to exclude from copy
$exclude = @(
    ".git",
    "node_modules",
    "sync-to-vencord.ps1",
    "sync-to-vencord.bat",
    ".gitignore"
)

Write-Host "Syncing winampControls to Vencord..." -ForegroundColor Cyan
Write-Host "Source: $source" -ForegroundColor Gray
Write-Host "Dest:   $dest" -ForegroundColor Gray
Write-Host ""

# Create destination if it doesn't exist
if (!(Test-Path $dest)) {
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Write-Host "Created destination directory" -ForegroundColor Yellow
}

# Clear destination (except .git if it exists)
Get-ChildItem -Path $dest -Exclude ".git" | Remove-Item -Recurse -Force

# Copy all files except excluded ones
Get-ChildItem -Path $source -Exclude $exclude | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
    Write-Host "  Copied: $($_.Name)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Sync complete!" -ForegroundColor Cyan
