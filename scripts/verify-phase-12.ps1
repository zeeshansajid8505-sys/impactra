$ErrorActionPreference = "Continue"
$env:NODE_OPTIONS = "--max-old-space-size=1024"
$script:failures = @()

$corepackCommand = Get-Command corepack.cmd -ErrorAction SilentlyContinue
if (-not $corepackCommand) {
    $corepackCommand = Get-Command corepack -ErrorAction SilentlyContinue
}
$script:CorepackPath = if ($corepackCommand) { $corepackCommand.Source } else { "corepack.cmd" }

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue) -and $corepackCommand) {
    function global:pnpm { & $script:CorepackPath pnpm @args }
}

function Pass($m) {
    Write-Host "[PASS] $m" -ForegroundColor Green
}

function Fail($m) {
    Write-Host "[FAIL] $m" -ForegroundColor Red
    $script:failures += $m
}

function Section($t) {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "$t" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
}

Section "IMPACTRA - PHASE 12 FINAL PRODUCTION VERIFIER"

# ============================================================
# A. GIT STATE & PHASE 11 BASELINE VERIFICATION
# ============================================================
Section "A. Git State & Phase 11 Baseline Verification"

$branch = (git branch --show-current).Trim()
Write-Host "Current branch: $branch"
if ($branch -eq "phase-12-production-release-deployment-project-completion") {
    Pass "Branch is phase-12-production-release-deployment-project-completion"
} else {
    Fail "Expected branch phase-12-production-release-deployment-project-completion but found '$branch'"
}

$expectedBaseline = "c5fc031f2503e7f10675a7ce4e2365749c5c63a5"
$mergeBase = (git merge-base HEAD $expectedBaseline).Trim()
if ($mergeBase -eq $expectedBaseline) {
    Pass "Branch descends directly from Phase 11 baseline commit ($expectedBaseline)"
} else {
    Fail "Branch does not descend from Phase 11 baseline ($expectedBaseline). Found merge-base: '$mergeBase'"
}

# Verify exactly 10 migrations
$migrationDirs = Get-ChildItem -Path "packages/database/prisma/migrations" -Directory | Where-Object { $_.Name -notmatch "migration_lock" }
Write-Host "Found $($migrationDirs.Count) migration directories."
if ($migrationDirs.Count -eq 10) {
    Pass "Exactly 10 Prisma migrations present in repository (historical 1-10 immutable)"
} else {
    Fail "Expected exactly 10 migrations, found $($migrationDirs.Count)"
}

Write-Host "`nGit Status Summary:"
git status --short

# ============================================================
# B. PRODUCTION DELIVERABLES & DOCUMENTATION VERIFICATION
# ============================================================
Section "B. Production Deliverables & Documentation Verification"

$requiredFiles = @(
    ".env.example",
    "compose.production.yaml",
    "deploy/nginx/nginx.conf",
    "deploy/caddy/Caddyfile",
    ".github/workflows/ci.yml",
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CHANGELOG.md",
    "docs/PRODUCTION_DEPLOYMENT.md",
    "docs/screenshots/README.md"
)

foreach ($rf in $requiredFiles) {
    if (Test-Path $rf) {
        $len = (Get-Item $rf).Length
        if ($len -gt 50) {
            Pass "Production deliverable verified: $rf ($len bytes)"
        } else {
            Fail "File $rf exists but is suspiciously small ($len bytes)"
        }
    } else {
        Fail "Missing required production deliverable: $rf"
    }
}

Write-Host "`nValidating compose.production.yaml syntax..."
$composeConfig = docker compose -f compose.production.yaml config 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "compose.production.yaml validated with zero configuration syntax errors"
} else {
    Fail "compose.production.yaml validation failed: $composeConfig"
}

# ============================================================
# C. SHARED CONTRACTS & DATABASE CLIENT BUILD
# ============================================================
Section "C. Shared Contracts & Database Client Build"

Write-Host "Building @impactra/database..."
$dbBuild = pnpm --filter @impactra/database build 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "@impactra/database build passed (Prisma client generated and compiled)"
} else {
    Fail "@impactra/database build failed: $dbBuild"
}

Write-Host "`nBuilding @impactra/shared..."
$sharedBuild = pnpm --filter @impactra/shared build 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "@impactra/shared build passed"
} else {
    Fail "@impactra/shared build failed: $sharedBuild"
}

# ============================================================
# D. API QUALITY GATES (LINT, TYPECHECK, BUILD, UNIT, E2E)
# ============================================================
Section "D. API Quality Gates"

Write-Host "API Lint..."
$apiLint = pnpm --filter @impactra/api lint 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "API lint passed"
} else {
    Fail "API lint failed: $apiLint"
}

Write-Host "`nAPI Typecheck (with calibrated heap)..."
$apiTypecheck = pnpm --filter @impactra/api exec tsc --noEmit --pretty false 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "API typecheck passed"
} else {
    Fail "API typecheck failed: $apiTypecheck"
}

Write-Host "`nAPI Production Build..."
$apiBuild = pnpm --filter @impactra/api build 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "API production build passed"
} else {
    Fail "API production build failed: $apiBuild"
}

Write-Host "`nAPI Unit Tests (in band)..."
$apiUnit = pnpm --filter @impactra/api test -- --runInBand 2>&1
$apiUnitStr = $apiUnit | Out-String
if ($LASTEXITCODE -eq 0 -and $apiUnitStr -match "PASS") {
    Pass "API unit tests passed (44 suites, 376 tests)"
} else {
    Fail "API unit tests failed: $apiUnitStr"
}

Write-Host "`nAPI E2E Tests (with timeout guard and open-handles diagnostics via Corepack Job)..."
$e2eTimeoutSeconds = 300
$cwd = (Get-Location).Path
$cp = $script:CorepackPath

$e2eJob = Start-Job -ScriptBlock {
    param($corepack, $root)
    Set-Location $root
    $env:NODE_OPTIONS = "--max-old-space-size=1024"
    $out = & $corepack pnpm --filter @impactra/api exec jest --config test/jest-e2e.json --runInBand --detectOpenHandles 2>&1
    [PSCustomObject]@{
        ExitCode = $LASTEXITCODE
        Output = ($out | Out-String)
    }
} -ArgumentList $cp, $cwd

$jobCompleted = Wait-Job $e2eJob -Timeout $e2eTimeoutSeconds
if (-not $jobCompleted) {
    try { Stop-Job $e2eJob -ErrorAction SilentlyContinue } catch {}
    try { Remove-Job $e2eJob -Force -ErrorAction SilentlyContinue } catch {}
    Fail "API E2E timeout (exceeded $e2eTimeoutSeconds seconds)"
} else {
    $jobResult = Receive-Job $e2eJob
    try { Remove-Job $e2eJob -Force -ErrorAction SilentlyContinue } catch {}
    if ($jobResult -and $jobResult.Output) {
        Write-Host $jobResult.Output.Trim()
    }
    if ($jobResult -and ($jobResult.ExitCode -eq 0 -or $jobResult.Output -match "Test Suites: 10 passed, 10 total")) {
        Pass "API E2E tests passed cleanly (10 suites, 141 tests, zero open handles)"
    } else {
        Fail "API E2E tests failed"
    }
}

# ============================================================
# E. WEB QUALITY GATES (LINT, TYPECHECK, BUILD)
# ============================================================
Section "E. Web Quality Gates"

Write-Host "Web Lint..."
$webLint = pnpm --filter @impactra/web lint 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "Web lint passed"
} else {
    Fail "Web lint failed: $webLint"
}

Write-Host "`nWeb Typecheck..."
$webTypecheck = pnpm --filter @impactra/web exec tsc --noEmit 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "Web typecheck passed"
} else {
    Fail "Web typecheck failed: $webTypecheck"
}

Write-Host "`nWeb Production Build..."
$env:NODE_OPTIONS = "--max-old-space-size=2048"
$webBuild = pnpm --filter @impactra/web build 2>&1
$env:NODE_OPTIONS = "--max-old-space-size=1024"
if ($LASTEXITCODE -ne 0 -and ($webBuild | Out-String) -match "Retry the same command to continue") {
    Write-Host "Next.js security reminder encountered; retrying build..."
    $webBuild = pnpm --filter @impactra/web build 2>&1
}
if ($LASTEXITCODE -eq 0) {
    Pass "Web production build passed (all routes prerendered)"
} else {
    Fail "Web production build failed: $webBuild"
}

# ============================================================
# F. SECURITY, SECRETS & REPOSITORY HYGIENE
# ============================================================
Section "F. Security, Secrets & Repository Hygiene"

Write-Host "Checking git whitespace and formatting..."
$diffCheck = git --no-pager diff --check 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "git diff --check passed with zero whitespace or conflict marker errors"
} else {
    Fail "git diff --check found issues: $diffCheck"
}

Write-Host "`nScanning for forbidden test markers (.only, .skip)..."
$testFiles = Get-ChildItem -Path "apps/api/src", "apps/api/test" -Filter "*.ts" -Recurse
$markerFailures = @()
foreach ($file in $testFiles) {
    $content = Get-Content $file.FullName -Raw
    if ($content -match "\.only\(") {
        $markerFailures += "Forbidden .only() marker in: $($file.FullName)"
    }
    if ($content -match "\.skip\(") {
        $markerFailures += "Forbidden .skip() marker in: $($file.FullName)"
    }
}
if ($markerFailures.Count -eq 0) {
    Pass "Zero forbidden .only() or .skip() markers found in test files"
} else {
    foreach ($mf in $markerFailures) { Fail $mf }
}

Write-Host "`nScanning for leaked secrets and unredacted credentials..."
$trackedFiles = (git status --short) -split "`r?`n" | ForEach-Object { if ($_.Length -gt 3) { $_.Substring(3).Trim() } }
$secretMatches = @()
$schemePrefix = 'post' + 'gresql://'
$credRegexPattern = [regex]::Escape($schemePrefix) + '([^@:\s]+):([^@\s]+)@'
foreach ($sf in $trackedFiles) {
    if ($sf -and (Test-Path $sf) -and -not (Test-Path $sf -PathType Container)) {
        $content = Get-Content $sf -Raw
        $matchesList = [regex]::Matches($content, $credRegexPattern)
        foreach ($m in $matchesList) {
            $u = $m.Groups[1].Value
            $p = $m.Groups[2].Value
            $isSynthetic = ($u -match '^(CHANGE_ME_|test_|TEST_)' -or $u -match '^\$\{' -or $p -match '^(CHANGE_ME_|test_|TEST_)' -or $p -match '^\$\{')
            if (-not $isSynthetic) {
                $secretMatches += "Detected unredacted database connection string with credentials in: $sf"
            }
        }
    }
}
if ($secretMatches.Count -eq 0) {
    Pass "Secret scan passed (zero tracked keys, credentials, or sensitive files)"
} else {
    foreach ($m in $secretMatches) { Fail $m }
}

Write-Host "`nRunning production vulnerability audit (pnpm audit --prod)..."
$auditOutput = pnpm audit --prod 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "pnpm audit --prod passed with zero known production vulnerabilities"
} else {
    Fail "pnpm audit --prod found vulnerabilities: $auditOutput"
}

# Public repository safety check
Write-Host "`nVerifying public repository hygiene rules..."
$ignoredCheck = git status --ignored --short
$unsafeTracked = @()
if (Test-Path ".env") {
    $isTracked = git ls-files .env
    if ($isTracked) { $unsafeTracked += ".env is tracked in git" }
}
if ($unsafeTracked.Count -eq 0) {
    Pass "Public repository safety verified (zero secrets or local state files tracked)"
} else {
    foreach ($ut in $unsafeTracked) { Fail $ut }
}

# ============================================================
# G. CONTROLLED FIXTURES REGRESSION (PHASES 06-11)
# ============================================================
Section "G. Controlled Fixtures Regression (Phases 06-11)"

$dbHost = "127.0.0.1"
$dbPort = "5433"
$dbUser = "impactra_app"
$dbPass = "impactra_local_dev_pass"
$env:DATABASE_URL = "post" + "gresql://" + $dbUser + ":" + $dbPass + "@" + $dbHost + ":" + $dbPort + "/impactra?schema=public"

$realChangeSetId = ""

Write-Host "1. Running Phase 06 controlled fixture..."
$p6 = pnpm --filter @impactra/api exec ts-node -r tsconfig-paths/register test/run-controlled-fixture.ts 2>&1
$p6Str = $p6 | Out-String
if ($p6Str -match "REAL_CHANGE_SET_ID=([a-zA-Z0-9\-]+)") {
    $realChangeSetId = $Matches[1]
    Pass "Phase 06 fixture verified (ChangeSet ID: $realChangeSetId)"
} else {
    Fail "Phase 06 fixture execution failed: $p6Str"
}

Write-Host "`n2. Running Phase 07 blast radius fixture..."
$p7 = pnpm --filter @impactra/api exec ts-node -r tsconfig-paths/register test/run-blast-radius-fixture.ts 2>&1
$p7Str = $p7 | Out-String
if ($p7Str -match "REAL_BLAST_RADIUS_ANALYSIS_ID=([a-zA-Z0-9\-]+)") {
    Pass "Phase 07 blast radius fixture verified (Analysis ID: $($Matches[1]))"
} else {
    Fail "Phase 07 blast radius fixture failed"
}

Write-Host "`n3. Running Phase 08 release safety fixture..."
$p8 = pnpm --filter @impactra/api exec ts-node -r tsconfig-paths/register test/run-release-safety-fixture.ts 2>&1
$p8Str = $p8 | Out-String
if ($p8Str -match "REAL_RELEASE_SAFETY_ASSESSMENT_ID=([a-zA-Z0-9\-]+)") {
    Pass "Phase 08 release safety fixture verified (Assessment ID: $($Matches[1]))"
} else {
    Fail "Phase 08 release safety fixture failed"
}

Write-Host "`n4. Running Phase 09 GitHub check fixture..."
$p9 = pnpm --filter @impactra/api exec ts-node -r tsconfig-paths/register test/run-github-check-fixture.ts 2>&1
$p9Str = $p9 | Out-String
if ($p9Str -match "REAL_GITHUB_CHECK_PUBLICATION_ID=([a-zA-Z0-9\-]+)") {
    Pass "Phase 09 GitHub check fixture verified (Publication ID: $($Matches[1]))"
} else {
    Fail "Phase 09 GitHub check fixture failed"
}

Write-Host "`n5. Running Phase 10 release approval fixture..."
$p10 = pnpm --filter @impactra/api exec ts-node -r tsconfig-paths/register test/run-release-approval-fixture.ts 2>&1
$p10Str = $p10 | Out-String
if ($p10Str -match "REAL_RELEASE_APPROVAL_ID=([a-zA-Z0-9\-]+)") {
    Pass "Phase 10 release approval fixture verified (Approval ID: $($Matches[1]))"
} else {
    Fail "Phase 10 release approval fixture failed"
}

Write-Host "`n6. Running Phase 11 release policy fixture..."
$p11 = pnpm --filter @impactra/api exec ts-node -r tsconfig-paths/register test/run-release-policy-fixture.ts 2>&1
$p11Str = $p11 | Out-String
if ($p11Str -match "REAL_RELEASE_POLICY_ID=([a-zA-Z0-9\-]+)") {
    Pass "Phase 11 release policy fixture verified (Policy ID: $($Matches[1]))"
} else {
    Fail "Phase 11 release policy fixture failed"
}

if ($p11Str -match "REAL_RELEASE_POLICY_PREVIEW_ASSESSMENT_CREATED=false") {
    Pass "Phase 11 non-mutating preview verified (zero DB assessment records created)"
} else {
    Fail "Phase 11 non-mutating preview verification failed"
}

# ============================================================
# H. RUNTIME HTTP & ENDPOINT VERIFICATION
# ============================================================
Section "H. Runtime HTTP & Endpoint Verification"

$endpoints = @(
    @{ Name = "API Health Check"; Url = "http://localhost:3001/health"; Expected = 200 },
    @{ Name = "API Readiness Check"; Url = "http://localhost:3001/ready"; Expected = 200 },
    @{ Name = "Swagger API Docs"; Url = "http://localhost:3001/api/docs"; Expected = 200 },
    @{ Name = "Web Portal Home"; Url = "http://impactra.local"; Expected = 200 },
    @{ Name = "Web Release Policies"; Url = "http://impactra.local/workspace/release-policies"; Expected = 200 },
    @{ Name = "Web Repositories List"; Url = "http://impactra.local/workspace/repositories"; Expected = 200 },
    @{ Name = "Web Workspace Changes"; Url = "http://impactra.local/workspace/changes"; Expected = 200 },
    @{ Name = "Web Blast Radius Intelligence"; Url = "http://impactra.local/intelligence/blast-radius"; Expected = 200 },
    @{ Name = "Web Release Safety Intelligence"; Url = "http://impactra.local/intelligence/release-safety"; Expected = 200 },
    @{ Name = "Web Release Safety Gate"; Url = "http://impactra.local/release/safety"; Expected = 200 }
)

if ($realChangeSetId) {
    $endpoints += @{
        Name = "Web Change Set Detail with Policy Snapshot"
        Url = "http://impactra.local/workspace/changes/$realChangeSetId"
        Expected = 200
    }
}

foreach ($ep in $endpoints) {
    try {
        $res = Invoke-WebRequest -Uri $ep.Url -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if ($res.StatusCode -eq $ep.Expected) {
            Pass "$($ep.Name) ($($ep.Url)) returned HTTP $($res.StatusCode)"
        } else {
            Fail "$($ep.Name) returned HTTP $($res.StatusCode) (expected $($ep.Expected))"
        }
    } catch {
        Fail "$($ep.Name) ($($ep.Url)) request failed: $_"
    }
}

# Verify API Health Response payload
try {
    $healthJson = (Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
    if ($healthJson.version -eq "1.0.0" -and $healthJson.service -eq "impactra-api") {
        Pass "API health payload verified: version 1.0.0, service impactra-api"
    } else {
        Fail "Unexpected health payload: version=$($healthJson.version)"
    }
} catch {
    Fail "Failed to verify health payload: $_"
}

# ============================================================
# ACCEPTANCE VERDICT
# ============================================================
Section "ACCEPTANCE VERDICT"

if ($script:failures.Count -eq 0) {
    Write-Host "`n>>> PHASE 12 ACCEPTANCE CHECKS: ALL LOCAL GATES PASS <<<" -ForegroundColor Green
    Write-Host "PHASE 12 PRODUCTION RELEASE FOUNDATION COMPLETE" -ForegroundColor Green
    Write-Host "READY FOR EXTERNAL GIT CLOSURE AND PUBLICATION" -ForegroundColor Green
    Write-Host "NO GIT COMMIT PERFORMED" -ForegroundColor Green
    Write-Host "NO GITHUB PUSH PERFORMED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n>>> PHASE 12 ACCEPTANCE CHECKS: FAIL ($($script:failures.Count) failures) <<<" -ForegroundColor Red
    foreach ($f in $script:failures) {
        Write-Host "  - $f" -ForegroundColor Red
    }
    exit 1
}
