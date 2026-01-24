@echo off
REM Sync winampControls to Vencord userplugins
REM Run this script after making changes to copy files to Vencord

set SOURCE=C:\Users\bezal\.claude-worktrees\winampControls\quirky-wiles
set DEST=C:\Users\bezal\Documents\Vencord\src\userplugins\winampControls

echo Syncing winampControls to Vencord...
echo Source: %SOURCE%
echo Dest:   %DEST%
echo.

REM Create destination if it doesn't exist
if not exist "%DEST%" mkdir "%DEST%"

REM Use robocopy to sync (mirrors source to dest, excluding certain files)
robocopy "%SOURCE%" "%DEST%" /MIR /XF sync-to-vencord.ps1 sync-to-vencord.bat .gitignore /XD .git node_modules /NFL /NDL /NJH /NJS /nc /ns /np

echo.
echo Sync complete!
pause
