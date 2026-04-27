@echo off
REM ============================================================
REM   Two Dots - Git hygiene audit
REM   Run before tagging any release. Prints findings to stdout.
REM ============================================================

setlocal

echo.
echo ============================================================
echo   Two Dots git audit
echo   %DATE% %TIME%
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/8] Working tree status
echo ------------------------------------------------------------
git status
echo.

echo [2/8] Branch and remote
echo ------------------------------------------------------------
git branch -a
echo.
git remote -v
echo.

echo [3/8] Recent history (last 20 commits)
echo ------------------------------------------------------------
git log --oneline -20
echo.

echo [4/8] Existing tags
echo ------------------------------------------------------------
git tag -l
echo.

echo [5/8] Has .env ever been committed? (Should print NOTHING)
echo ------------------------------------------------------------
git log --all --oneline -- .env .env.local .env.*.local 2>nul
echo (end of .env history check)
echo.

echo [6/8] Have certificates ever been committed? (Should print NOTHING)
echo ------------------------------------------------------------
git log --all --oneline -- "*.p8" "*.p12" "*.key" "*.jks" "*.mobileprovision" "play-service-account.json" 2>nul
echo (end of certificate history check)
echo.

echo [7/8] Have native build dirs ever been committed? (Should print NOTHING or only .gitkeep-style)
echo ------------------------------------------------------------
git log --all --oneline -- android/ ios/ 2>nul
echo (end of native dirs history check)
echo.

echo [8/8] Tracked files outside the source tree (sanity scan)
echo ------------------------------------------------------------
git ls-files --error-unmatch -- "*.zip" "*.tar" "*.tgz" "*.7z" "*.iso" "*.dmg" 2>nul
echo (end of binary archive scan; no output means clean)
echo.

echo ============================================================
echo   Audit complete.
echo.
echo   If sections 5-7 listed any commits, those secrets/binaries
echo   are in history. Anon Supabase keys are safe-by-design
echo   (RLS gates access) but rotate them anyway. Cert keys and
echo   service account JSONs MUST be rotated immediately.
echo ============================================================
echo.

endlocal
