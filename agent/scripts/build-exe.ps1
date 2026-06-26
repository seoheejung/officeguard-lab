$ErrorActionPreference = 'Stop'

# Agent 프로젝트 경로 조회
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

# 빌드 결과 경로 구성
$distDirectory = Join-Path $projectRoot 'dist'
$bundlePath = Join-Path $distDirectory 'agent.cjs'
$blobPath = Join-Path $distDirectory 'sea-prep.blob'
$executablePath = Join-Path $distDirectory 'officeguard-agent.exe'

Set-Location $projectRoot

# 기존 빌드 결과 삭제
Remove-Item -Path $distDirectory -Recurse -Force -ErrorAction SilentlyContinue

# 빌드 결과 디렉터리 생성
New-Item -Path $distDirectory -ItemType Directory -Force | Out-Null

Write-Host '[agent-build] TypeScript bundle'

# TypeScript 소스 CommonJS Bundle 생성
pnpm run bundle

if ($LASTEXITCODE -ne 0) {
    throw '[agent-build] bundle failed'
}

# Bundle 파일 생성 확인
if (-not (Test-Path $bundlePath)) {
    throw '[agent-build] bundle file not found'
}

Write-Host '[agent-build] SEA blob generation'

# CommonJS Bundle 기반 SEA Blob 생성
node --experimental-sea-config sea-config.json

if ($LASTEXITCODE -ne 0) {
    throw '[agent-build] SEA blob generation failed'
}

# SEA Blob 생성 확인
if (-not (Test-Path $blobPath)) {
    throw '[agent-build] SEA blob not found'
}

Write-Host '[agent-build] Node executable lookup'

# 현재 Node.js 실행 파일 경로 조회
$nodeExecutablePath = node -p "process.execPath"

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeExecutablePath)) {
    throw '[agent-build] Node executable lookup failed'
}

$nodeExecutablePath = $nodeExecutablePath.Trim()

# Node.js 실행 파일 존재 확인
if (-not (Test-Path $nodeExecutablePath)) {
    throw "[agent-build] Node executable not found. path=$nodeExecutablePath"
}

Write-Host '[agent-build] Node executable copy'

# SEA 실행 파일 기반 node.exe 복사
Copy-Item -Path $nodeExecutablePath -Destination $executablePath -Force

# 실행 파일 복사 확인
if (-not (Test-Path $executablePath)) {
    throw '[agent-build] Node executable copy failed'
}

Write-Host '[agent-build] SEA blob injection'

# 복사한 Node.js 실행 파일에 SEA Blob 주입
pnpm exec postject $executablePath NODE_SEA_BLOB $blobPath `
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

if ($LASTEXITCODE -ne 0) {
    throw '[agent-build] SEA blob injection failed'
}

# 최종 Agent 실행 파일 생성 확인
if (-not (Test-Path $executablePath)) {
    throw '[agent-build] executable not found'
}

Write-Host ''
Write-Host '[agent-build] executable created'
Write-Host $executablePath