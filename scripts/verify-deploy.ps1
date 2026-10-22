# Verifies the running deployment against the image digest CI committed.
#   .\scripts\verify-deploy.ps1 [-Namespace react-app] [-Cosign]
# Checks (all SHA-256 digests):
#   1. digest in helm/react-app/values.yaml on origin/main
#   2. digest in the live Deployment spec
#   3. imageID of every running pod
#   4. (-Cosign) the keyless cosign signature for that digest
param(
  [string]$Namespace = 'react-app',
  [string]$Repository = 'rheslar1/react_app1',
  [switch]$Cosign
)

$ErrorActionPreference = 'Stop'
$failed = $false

function Fail($msg) { Write-Host "FAIL  $msg" -ForegroundColor Red; $script:failed = $true }
function Pass($msg) { Write-Host "OK    $msg" -ForegroundColor Green }

git fetch origin main --quiet
$values = git show origin/main:helm/react-app/values.yaml
$expected = ($values | Select-String 'digest:\s*"(sha256:[0-9a-f]{64})"').Matches.Groups[1].Value
$repo = ($values | Select-String '^\s*repository:\s*(\S+)').Matches.Groups[1].Value
if (-not $expected) { throw 'No digest found in helm/react-app/values.yaml on origin/main' }
Write-Host "Expected: $repo@$expected"

$spec = kubectl -n $Namespace get deployment react-app -o jsonpath='{.spec.template.spec.containers[0].image}'
if ($spec -like "*@$expected") { Pass 'Deployment spec uses the committed digest' }
else { Fail "Deployment image is '$spec'" }

# An index digest (image + SBOM/provenance) can share its linux/amd64 image with an
# earlier build, and the node may report either index. So compare the platform image.
function Get-PlatformDigest([string]$ref) {
  $raw = docker buildx imagetools inspect $ref --raw
  $idx = $raw | ConvertFrom-Json
  if ($idx.manifests) {
    return ($idx.manifests | Where-Object { $_.platform.os -eq 'linux' -and $_.platform.architecture -eq 'amd64' }).digest
  }
  return ($ref -split '@')[1]
}

$expectedPlatform = Get-PlatformDigest "$repo@$expected"
Write-Host "Platform image (linux/amd64): $expectedPlatform"

$pods = kubectl -n $Namespace get pods -l app=react-app -o json | ConvertFrom-Json
$running = @($pods.items | Where-Object { $_.status.phase -eq 'Running' -and -not $_.metadata.deletionTimestamp })
if ($running.Count -eq 0) { Fail 'No running pods' }
foreach ($p in $running) {
  $id = $p.status.containerStatuses[0].imageID
  $podDigest = ($id -split '@')[1]
  if ($podDigest -eq $expected -or (Get-PlatformDigest "$repo@$podDigest") -eq $expectedPlatform) {
    Pass "$($p.metadata.name) runs $expectedPlatform"
  } else { Fail "$($p.metadata.name) runs '$id'" }
}

if ($Cosign) {
  cosign verify "$repo@$expected" `
    --certificate-identity-regexp "^https://github.com/$Repository/\.github/workflows/deploy\.yml@" `
    --certificate-oidc-issuer https://token.actions.githubusercontent.com *> $null
  if ($LASTEXITCODE -eq 0) { Pass 'cosign signature verified' } else { Fail 'cosign signature verification failed' }
}

if ($failed) { exit 1 }
Write-Host 'Deployment verified.' -ForegroundColor Green
