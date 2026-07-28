@echo off
setlocal enabledelayedexpansion

echo ============================================
echo Phase 1c.2 Verification Tests
echo ============================================
echo.

REM Get Keycloak master admin token
echo [1] Getting Keycloak admin token...
curl -s -X POST http://localhost:8180/realms/master/protocol/openid-connect/token -d "grant_type=password&client_id=admin-cli&username=admin&password=admin" > %TEMP%\kc_master.json
echo OK

REM Enable direct access grants on acis-frontend temporarily
echo [2] Enabling direct grants on acis-frontend...
for /f "delims=" %%i in ('powershell -Command "(Get-Content '%TEMP%\kc_master.json' -Raw | ConvertFrom-Json).access_token"') do set ADMIN_TOKEN=%%i

curl -s "http://localhost:8180/admin/realms/acis/clients?clientId=acis-frontend" -H "Authorization: Bearer %ADMIN_TOKEN%" > %TEMP%\kc_client.json
for /f "delims=" %%i in ('powershell -Command "((Get-Content '%TEMP%\kc_client.json' -Raw | ConvertFrom-Json)[0]).id"') do set CLIENT_UUID=%%i
echo Client UUID: %CLIENT_UUID%

curl -s -X PUT "http://localhost:8180/admin/realms/acis/clients/%CLIENT_UUID%" -H "Authorization: Bearer %ADMIN_TOKEN%" -H "Content-Type: application/json" -d "{\"clientId\":\"acis-frontend\",\"publicClient\":true,\"directAccessGrantsEnabled\":true,\"standardFlowEnabled\":true}" > nul 2>&1
echo Direct grants enabled

REM Get platform-admin user token
echo [3] Getting platform-admin token...
curl -s -X POST http://localhost:8180/realms/acis/protocol/openid-connect/token -d "grant_type=password&client_id=acis-frontend&username=platform-admin&password=acis123" > %TEMP%\pa_token.json
for /f "delims=" %%i in ('powershell -Command "(Get-Content '%TEMP%\pa_token.json' -Raw | ConvertFrom-Json).access_token"') do set PA_TOKEN=%%i
echo Token length: %PA_TOKEN:~0,20%...

REM Get regular user token (for authorization test)
echo [4] Getting regular user (admin) token...
curl -s -X POST http://localhost:8180/realms/acis/protocol/openid-connect/token -d "grant_type=password&client_id=acis-frontend&username=admin&password=acis123" > %TEMP%\user_token.json
for /f "delims=" %%i in ('powershell -Command "(Get-Content '%TEMP%\user_token.json' -Raw | ConvertFrom-Json).access_token"') do set USER_TOKEN=%%i
echo Token obtained

echo.
echo ============================================
echo TEST: List Users (Platform Admin)
echo ============================================
curl -s http://localhost:8088/api/platform/users -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_users.json
powershell -Command "$r = Get-Content '%TEMP%\test_users.json' -Raw | ConvertFrom-Json; Write-Host ('Success: ' + $r.success + ' | Users: ' + $r.data.Count)"

echo.
echo ============================================
echo TEST: Authorization - Regular User DENIED
echo ============================================
curl -s -o %TEMP%\test_denied.json -w "HTTP Status: %%{http_code}" http://localhost:8088/api/platform/users -H "Authorization: Bearer %USER_TOKEN%"
echo.
type %TEMP%\test_denied.json
echo.

echo.
echo ============================================
echo TEST: Get User Detail
echo ============================================
for /f "delims=" %%i in ('powershell -Command "((Get-Content '%TEMP%\test_users.json' -Raw | ConvertFrom-Json).data | Where-Object { $_.username -eq 'admin' }).id"') do set ADMIN_USER_ID=%%i
echo Admin user ID: %ADMIN_USER_ID%
curl -s "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_detail.json
powershell -Command "$r = Get-Content '%TEMP%\test_detail.json' -Raw | ConvertFrom-Json; Write-Host ('User: ' + $r.data.username + ' | Enabled: ' + $r.data.enabled + ' | Locked: ' + $r.data.locked)"

echo.
echo ============================================
echo TEST: Security Info
echo ============================================
curl -s "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_security.json
powershell -Command "$r = Get-Content '%TEMP%\test_security.json' -Raw | ConvertFrom-Json; Write-Host ('Status: ' + $r.data.accountStatus + ' | MFA: ' + $r.data.mfaEnabled + ' | Sessions: ' + $r.data.activeSessionCount + ' | Failed: ' + $r.data.failedLoginAttempts)"

echo.
echo ============================================
echo TEST: Password Reset
echo ============================================
curl -s -X POST "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security/password/reset" -H "Authorization: Bearer %PA_TOKEN%" -H "Content-Type: application/json" -d "{\"newPassword\":\"acis123\",\"temporary\":false}" > %TEMP%\test_pwreset.json
powershell -Command "$r = Get-Content '%TEMP%\test_pwreset.json' -Raw | ConvertFrom-Json; Write-Host ('Password Reset: ' + $r.success)"

echo.
echo ============================================
echo TEST: Generate Temp Password
echo ============================================
curl -s -X POST "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security/password/temp-generate" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_tempw.json
powershell -Command "$r = Get-Content '%TEMP%\test_tempw.json' -Raw | ConvertFrom-Json; Write-Host ('Temp Password: ' + $r.data.tempPassword)"

echo.
echo ============================================
echo TEST: Force Password Change
echo ============================================
curl -s -X POST "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security/password/force-change" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_forcechange.json
powershell -Command "$r = Get-Content '%TEMP%\test_forcechange.json' -Raw | ConvertFrom-Json; Write-Host ('Force Change: ' + $r.success)"

echo.
echo ============================================
echo TEST: List Sessions
echo ============================================
curl -s "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security/sessions" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_sessions.json
powershell -Command "$r = Get-Content '%TEMP%\test_sessions.json' -Raw | ConvertFrom-Json; Write-Host ('Sessions: ' + $r.data.Count)"

echo.
echo ============================================
echo TEST: Lock Account
echo ============================================
curl -s -X POST "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security/lock" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_lock.json
powershell -Command "$r = Get-Content '%TEMP%\test_lock.json' -Raw | ConvertFrom-Json; Write-Host ('Locked: ' + $r.success)"

echo.
echo ============================================
echo TEST: Unlock Account
echo ============================================
curl -s -X POST "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security/unlock" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_unlock.json
powershell -Command "$r = Get-Content '%TEMP%\test_unlock.json' -Raw | ConvertFrom-Json; Write-Host ('Unlocked: ' + $r.success)"

echo.
echo ============================================
echo TEST: Require MFA
echo ============================================
curl -s -X POST "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security/mfa/require" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_mfa_req.json
powershell -Command "$r = Get-Content '%TEMP%\test_mfa_req.json' -Raw | ConvertFrom-Json; Write-Host ('MFA Required: ' + $r.success)"

echo.
echo ============================================
echo TEST: Remove MFA
echo ============================================
curl -s -X POST "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security/mfa/remove" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_mfa_rem.json
powershell -Command "$r = Get-Content '%TEMP%\test_mfa_rem.json' -Raw | ConvertFrom-Json; Write-Host ('MFA Removed: ' + $r.success)"

echo.
echo ============================================
echo TEST: Clear Brute Force
echo ============================================
curl -s -X POST "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security/brute-force/clear" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_bf.json
powershell -Command "$r = Get-Content '%TEMP%\test_bf.json' -Raw | ConvertFrom-Json; Write-Host ('Brute-Force Cleared: ' + $r.success)"

echo.
echo ============================================
echo TEST: Audit Logs
echo ============================================
curl -s "http://localhost:8088/api/platform/audit?page=0&size=10" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_audit.json
powershell -Command "$r = Get-Content '%TEMP%\test_audit.json' -Raw | ConvertFrom-Json; Write-Host ('Audit Logs: ' + $r.data.totalElements + ' records | Page content: ' + $r.data.content.Count)"

echo.
echo ============================================
echo TEST: Audit Actions List
echo ============================================
curl -s "http://localhost:8088/api/platform/audit/actions" -H "Authorization: Bearer %PA_TOKEN%" > %TEMP%\test_actions.json
powershell -Command "$r = Get-Content '%TEMP%\test_actions.json' -Raw | ConvertFrom-Json; Write-Host ('Actions available: ' + $r.data.Count)"

echo.
echo ============================================
echo TEST: Reset password back to acis123
echo ============================================
curl -s -X POST "http://localhost:8088/api/platform/users/%ADMIN_USER_ID%/security/password/reset" -H "Authorization: Bearer %PA_TOKEN%" -H "Content-Type: application/json" -d "{\"newPassword\":\"acis123\",\"temporary\":false}" > nul

echo.
echo ============================================
echo ALL TESTS COMPLETE
echo ============================================

REM Disable direct grants again
curl -s -X PUT "http://localhost:8180/admin/realms/acis/clients/%CLIENT_UUID%" -H "Authorization: Bearer %ADMIN_TOKEN%" -H "Content-Type: application/json" -d "{\"clientId\":\"acis-frontend\",\"publicClient\":true,\"directAccessGrantsEnabled\":false,\"standardFlowEnabled\":true}" > nul 2>&1
echo Direct grants disabled (restored)
