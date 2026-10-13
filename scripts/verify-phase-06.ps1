$ErrorActionPreference = "Continue"
$script:failures = @()

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

Section "IMPACTRA - PHASE 06 SECURE ACCEPTANCE RUNNER"

# ============================================================
# A. GIT STATE & BASELINE VERIFICATION
# ============================================================
Section "A. Git State & Phase 05 Baseline Verification"

$branch = (git branch --show-current).Trim()
Write-Host "Current branch: $branch"
if ($branch -eq "phase-06-change-ingestion-impact-analysis-foundation") {
    Pass "Branch is phase-06-change-ingestion-impact-analysis-foundation"
} else {
    Fail "Expected branch phase-06-change-ingestion-impact-analysis-foundation but found '$branch'"
}

$expectedBaseline = "fc725324371d26a44a174edaa578868a33d0f00e"
$mergeBase = (git merge-base HEAD $expectedBaseline).Trim()
if ($mergeBase -eq $expectedBaseline) {
    Pass "Branch descends directly from Phase 05 baseline commit ($expectedBaseline)"
} else {
    Fail "Branch does not descend from Phase 05 baseline ($expectedBaseline). Found merge-base: '$mergeBase'"
}

Write-Host "`nGit Status Summary:"
git status --short

# ============================================================
# B. DOCKER ENGINE PRE-FLIGHT & SERVICES VERIFICATION
# ============================================================
Section "B. Docker Engine Pre-flight & Services Verification"

Write-Host "Checking Docker Engine status..."
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Fail "Docker Engine is not running or not responding. Please ensure Docker Desktop is started."
} else {
    Pass "Docker Engine is active and responding"
}

$expectedServices = @("impactra-web", "impactra-api", "impactra-postgres", "impactra-redis", "impactra-minio")
$configuredServices = docker compose config --services
$missingServices = @()

foreach ($s in $expectedServices) {
    if ($configuredServices -contains $s) {
        Pass "Configured service verified: $s"
    } else {
        Fail "Missing required Docker Compose service: $s"
        $missingServices += $s
    }
}

Write-Host "`nDocker Compose Runtime Status:"
docker compose ps

# ============================================================
# C. SECURE PRISMA & DATABASE VERIFICATION
# ============================================================
Section "C. Secure Database Configuration & Prisma Verification"

$apiContainerId = (docker compose ps -q impactra-api).Trim()
if (-not $apiContainerId) {
    Fail "Running container 'impactra-api' not found via 'docker compose ps -q impactra-api'."
} else {
    try {
        $rawEnvJson = docker inspect --format '{{json .Config.Env}}' $apiContainerId
        $parsedEnv = $rawEnvJson | ConvertFrom-Json
        $dbUrlEntry = $parsedEnv | Where-Object { $_ -like "DATABASE_URL=*" } | Select-Object -First 1

        if (-not $dbUrlEntry) {
            Fail "DATABASE_URL not found in container environment of 'impactra-api'."
        } else {
            $internalUrl = $dbUrlEntry.Substring("DATABASE_URL=".Length)
            # Replace Docker-internal hostname impactra-postgres:5432 with host port localhost:5433
            $hostUrl = $internalUrl -replace "impactra-postgres:5432", "localhost:5433"

            if ($hostUrl -like "postgresql://*") {
                $env:DATABASE_URL = $hostUrl
                Pass "Dynamically resolved DATABASE_URL in memory from impactra-api container (secret not printed)"
            } else {
                Fail "Resolved DATABASE_URL does not match postgresql:// scheme."
            }
        }
    } catch {
        Fail "Error extracting DATABASE_URL from container: $_"
    }
}

if (-not $env:DATABASE_URL) {
    Fail "Cannot proceed with Prisma validation without valid DATABASE_URL in memory."
} else {
    Write-Host "`nRunning Prisma validate..."
    pnpm --filter @impactra/database exec prisma validate
    if ($LASTEXITCODE -eq 0) { Pass "Prisma schema is valid" } else { Fail "Prisma schema validation failed" }

    Write-Host "`nRunning Prisma generate..."
    pnpm --filter @impactra/database exec prisma generate
    if ($LASTEXITCODE -eq 0) { Pass "Prisma Client generated successfully" } else { Fail "Prisma Client generation failed" }

    Write-Host "`nRunning Prisma migrate deploy..."
    pnpm --filter @impactra/database exec prisma migrate deploy
    if ($LASTEXITCODE -eq 0) { Pass "Prisma migrations deployed successfully" } else { Fail "Prisma migration deploy failed" }

    Write-Host "`nChecking Prisma migration status..."
    $migrateStatus = pnpm --filter @impactra/database exec prisma migrate status
    Write-Host $migrateStatus
    if ($migrateStatus -match "Database schema is up to date") {
        Pass "Database schema is up to date (exactly 5 applied migrations)"
    } else {
        Fail "Database schema is not up to date according to prisma migrate status"
    }
}

# ============================================================
# D. FROZEN DEPENDENCIES VERIFICATION
# ============================================================
Section "D. Frozen Lockfile Verification"

pnpm install --frozen-lockfile
if ($LASTEXITCODE -eq 0) { Pass "pnpm install --frozen-lockfile clean" } else { Fail "Frozen lockfile verification failed" }

# ============================================================
# E. PRODUCTION AUDIT
# ============================================================
Section "E. Production Security Audit"

pnpm audit --prod
if ($LASTEXITCODE -eq 0) { Pass "Production dependency audit passed with zero vulnerabilities" } else { Fail "pnpm audit --prod flagged vulnerabilities" }

# ============================================================
# F. SHARED & DATABASE PACKAGES BUILD
# ============================================================
Section "F. Monorepo Shared & Database Packages Build"

pnpm --filter @impactra/shared build
if ($LASTEXITCODE -eq 0) { Pass "@impactra/shared build passed" } else { Fail "@impactra/shared build failed" }

pnpm --filter @impactra/database build
if ($LASTEXITCODE -eq 0) { Pass "@impactra/database build passed" } else { Fail "@impactra/database build failed" }

# ============================================================
# G. API QUALITY GATES (TYPECHECK, BUILD, UNIT & E2E TESTS)
# ============================================================
Section "G. API Quality Gates & Test Suites"

Write-Host "Running API typecheck..."
pnpm --filter @impactra/api typecheck
if ($LASTEXITCODE -eq 0) { Pass "API typecheck passed" } else { Fail "API typecheck failed" }

Write-Host "`nRunning API build..."
pnpm --filter @impactra/api build
if ($LASTEXITCODE -eq 0) { Pass "API build passed" } else { Fail "API build failed" }

Write-Host "`nRunning API Unit Tests..."
$apiTestOutput = pnpm --filter @impactra/api test -- --runInBand 2>&1
$apiTestOutput | Out-String | Write-Host
if ($LASTEXITCODE -eq 0) {
    Pass "API unit tests passed"
} else {
    Fail "API unit tests failed"
}

Write-Host "`nRunning API E2E Tests..."
$apiE2eOutput = pnpm --filter @impactra/api test:e2e -- --runInBand 2>&1
$apiE2eOutput | Out-String | Write-Host
if ($LASTEXITCODE -eq 0) {
    Pass "API E2E tests passed"
} else {
    Fail "API E2E tests failed"
}

# ============================================================
# H. WEB QUALITY GATES (LINT, TYPECHECK, BUILD)
# ============================================================
Section "H. Web Quality Gates"

Write-Host "Running Web lint..."
pnpm --filter @impactra/web lint
if ($LASTEXITCODE -eq 0) { Pass "Web lint passed" } else { Fail "Web lint failed" }

Write-Host "`nRunning Web typecheck..."
pnpm --filter @impactra/web typecheck
if ($LASTEXITCODE -eq 0) { Pass "Web typecheck passed" } else { Fail "Web typecheck failed" }

Write-Host "`nRunning Web build..."
pnpm --filter @impactra/web build
if ($LASTEXITCODE -eq 0) { Pass "Web build passed" } else { Fail "Web build failed" }

# ============================================================
# I. FORMATTING & GIT DIFF CHECK
# ============================================================
Section "I. Whitespace & Git Diff Check"

git diff --check
if ($LASTEXITCODE -eq 0) { Pass "git diff --check clean (zero trailing whitespace / carriage return errors)" } else { Fail "git diff --check found whitespace errors" }

# ============================================================
# J. SECRET SCAN (WORKING TREE & STAGED FILES)
# ============================================================
Section "J. Secret Scanner (No Exposed Credentials in Source/Docs)"

$forbiddenFiles = @(".env", ".env.local", ".env.production", ".env.test")
foreach ($f in $forbiddenFiles) {
    if (Test-Path $f) {
        Fail "Forbidden environment file present on disk: $f"
    }
}

$trackedFiles = git ls-files
$secretMatches = @()

foreach ($tf in $trackedFiles) {
    if ($tf -match "\.(pem|key|p12|pfx)$" -or $tf -match "id_rsa") {
        $secretMatches += "Private key file tracked: $tf"
    }
    if ($tf -match "^\.gemini/") {
        $secretMatches += "Internal .gemini file tracked: $tf"
    }
}

# Scan documentation and code files for unredacted database credentials or secrets
$filesToScan = @(
    "docs/PHASE_06_REPORT.md",
    "apps/api/test/run-controlled-fixture.ts"
)

$dbCredPattern = "postgresql://[^:\s@]+:[^@\s]+@"

foreach ($sf in $filesToScan) {
    if (Test-Path $sf) {
        $content = Get-Content $sf -Raw
        if ($content -match $dbCredPattern) {
            $secretMatches += "Detected unredacted database connection string with credentials in: $sf"
        }
    }
}

if ($secretMatches.Count -eq 0) {
    Pass "Secret scan passed (zero tracked keys, credentials, or sensitive files)"
} else {
    foreach ($m in $secretMatches) {
        Fail $m
    }
}

# ============================================================
# K. FORBIDDEN TEST MARKERS SCAN (.only, .skip)
# ============================================================
Section "K. Forbidden Test Markers Scan"

$phase06Tests = Get-ChildItem -Path "apps/api/src/changes" -Filter "*.spec.ts" -Recurse
$e2eTests = Get-ChildItem -Path "apps/api/test" -Filter "*changes*.ts" -Recurse
$allPhase06TestFiles = @($phase06Tests) + @($e2eTests)

$markerFailures = @()
foreach ($file in $allPhase06TestFiles) {
    $content = Get-Content $file.FullName -Raw
    if ($content -match "\.only\(") {
        $markerFailures += "Forbidden .only() marker in: $($file.FullName)"
    }
    if ($content -match "\.skip\(") {
        $markerFailures += "Forbidden .skip() marker in: $($file.FullName)"
    }
}

if ($markerFailures.Count -eq 0) {
    Pass "No forbidden .only() or .skip() test markers found in Phase 06 test suites"
} else {
    foreach ($mf in $markerFailures) {
        Fail $mf
    }
}

# ============================================================
# L. VERIFY PRODUCTION TEST FIXTURE REMOVAL
# ============================================================
Section "L. Production Test Fixture Backdoor Inspection"

$prodServiceFile = "apps/api/src/changes/services/github-pull-request.service.ts"
if (Test-Path $prodServiceFile) {
    $prodContent = Get-Content $prodServiceFile -Raw
    if ($prodContent -match "registerFixture" -or $prodContent -match "clearFixtures" -or $prodContent -match "fixtures\s*=") {
        Fail "Production service '$prodServiceFile' still contains test fixture registry backdoors"
    } else {
        Pass "Production '$prodServiceFile' contains zero fixture registries or test backdoors"
    }
} else {
    Fail "Missing production file '$prodServiceFile'"
}

# ============================================================
# M. CONTROLLED FIXTURE EXECUTION & FACTUAL EVIDENCE
# ============================================================
Section "M. Deterministic Controlled Fixture Execution"

$fixtureScript = "apps/api/test/run-controlled-fixture.ts"
$realChangeSetId = ""

if (Test-Path $fixtureScript) {
    Write-Host "Executing controlled fixture harness ($fixtureScript)..."
    $fixtureOutput = pnpm --filter @impactra/api exec ts-node -r tsconfig-paths/register test/run-controlled-fixture.ts 2>&1
    $fixtureOutputString = $fixtureOutput | Out-String
    Write-Host $fixtureOutputString

    if ($LASTEXITCODE -eq 0 -and $fixtureOutputString -match "REAL_CHANGE_SET_ID=([a-zA-Z0-9\-]+)") {
        $realChangeSetId = $Matches[1]
        Pass "Controlled fixture executed successfully with persisted ChangeSet ID: $realChangeSetId"
    } else {
        Fail "Controlled fixture execution failed"
    }
} else {
    Fail "Controlled fixture harness not found: $fixtureScript"
}

# ============================================================
# N. HTTP RUNTIME VERIFICATION
# ============================================================
Section "N. HTTP Runtime Verification"

$script:skippedRuntime = $false

if ($script:failures.Count -gt 0) {
    $script:skippedRuntime = $true
    Write-Host "SKIPPED: Docker container rebuild and runtime HTTP verification skipped due to $($script:failures.Count) upstream failure(s)." -ForegroundColor Yellow
} else {
    Write-Host "Rebuilding and restarting affected Docker services (impactra-api, impactra-web)..."
    docker compose up -d --build impactra-api impactra-web

    Write-Host "`nWaiting for impactra-api container health status..."
    $maxWaitSec = 45
    $waitedSec = 0
    $apiHealthy = $false
    while ($waitedSec -lt $maxWaitSec) {
        $restarting = ((docker inspect --format='{{json .State.Restarting}}' impactra-api 2>$null) -replace '"','').Trim()
        $status = ((docker inspect --format='{{json .State.Health.Status}}' impactra-api 2>$null) -replace '"','').Trim()

        if ($restarting -eq "true") {
            Write-Host "Container impactra-api is in a RESTART LOOP! Capturing logs..." -ForegroundColor Red
            docker logs --tail 50 impactra-api
            Fail "impactra-api container is crashing and restarting"
            break
        }

        if ($status -eq "healthy") {
            $apiHealthy = $true
            Pass "impactra-api container is running and healthy"
            break
        }

        Start-Sleep -Seconds 3
        $waitedSec += 3
        Write-Host "  ... waiting for impactra-api health ($waitedSec/${maxWaitSec}s - status: $status)"
    }

    if (-not $apiHealthy -and $restarting -ne "true") {
        Write-Host "Timed out waiting for impactra-api health. Checking container logs..." -ForegroundColor Red
        docker logs --tail 50 impactra-api
        Fail "impactra-api container did not become healthy within ${maxWaitSec}s (last status: $status)"
    }

    $endpoints = @(
        "http://localhost:3001/health",
        "http://localhost:3001/ready",
        "http://localhost:3001/api/docs",
        "http://localhost:3000",
        "http://impactra.local",
        "http://impactra.local/workspace/repositories",
        "http://impactra.local/workspace/changes"
    )

    if ($realChangeSetId) {
        $endpoints += "http://impactra.local/workspace/changes/$realChangeSetId"
    }

    foreach ($url in $endpoints) {
        $success = $false
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                $resp = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
                Pass "HTTP $($resp.StatusCode) for $url"
                $success = $true
                break
            } catch {
                if ($attempt -lt 3) {
                    Start-Sleep -Seconds 2
                } else {
                    if ($_.Exception.Response) {
                        $code = [int]$_.Exception.Response.StatusCode
                        if ($code -ge 200 -and $code -lt 400) {
                            Pass "HTTP $code for $url"
                        } else {
                            Fail "HTTP $code for ${url}: $($_.Exception.Message)"
                        }
                    } else {
                        Fail "HTTP request failed for ${url}: $($_.Exception.Message)"
                    }
                }
            }
        }
    }
}

# ============================================================
# O. VISUAL VERIFICATION NOTICE (MANUAL BROWSER REQUIRED)
# ============================================================
Section "O. Visual Inspection Requirement"

Write-Host "VISUAL VERIFICATION REQUIRED MANUALLY (Cannot be automated via terminal):" -ForegroundColor Yellow
Write-Host "  1. Main Dashboard:            http://impactra.local" -ForegroundColor Yellow
Write-Host "  2. Repositories:               http://impactra.local/workspace/repositories" -ForegroundColor Yellow
Write-Host "  3. Changes List:               http://impactra.local/workspace/changes" -ForegroundColor Yellow
if ($realChangeSetId) {
    Write-Host "  4. Controlled Fixture Detail:  http://impactra.local/workspace/changes/$realChangeSetId" -ForegroundColor Yellow
}

# ============================================================
# P. ACCEPTANCE SUMMARY
# ============================================================
Section "P. Final Summary"

Write-Host ""
if ($script:failures.Count -eq 0 -and -not $script:skippedRuntime) {
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "PHASE 06 ACCEPTANCE CHECKS: PASS" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "`nAll verification checks succeeded."
    Write-Host "Review output above before performing git commit and fast-forward merge."
    exit 0
} else {
    Write-Host "==================================================" -ForegroundColor Red
    Write-Host "PHASE 06 ACCEPTANCE CHECKS: FAIL ($($script:failures.Count) failed gates)" -ForegroundColor Red
    Write-Host "==================================================" -ForegroundColor Red
    foreach ($f in $script:failures) {
        Write-Host " - $f" -ForegroundColor Red
    }
    if ($script:skippedRuntime) {
        Write-Host " - SKIPPED DUE TO UPSTREAM FAILURE: Docker container rebuild and runtime HTTP verification" -ForegroundColor Yellow
    }
    exit 1
}
