<#
.SYNOPSIS
  Seals the relayops-db Secret for the react-app namespace into the Helm chart.

.DESCRIPTION
  Prompts for the application database password and the MySQL root password,
  encrypts them with kubeseal against the cluster's Sealed Secrets controller,
  and writes helm/react-app/templates/relayops-db-sealedsecret.yaml. Plaintext
  values stay in memory and are never written to disk. Review the output and
  commit it; Argo CD then creates the relayops-db Secret in the cluster.

  Requires kubeseal (v0.41.1 or newer compatible) on PATH and the
  Sealed Secrets controller installed in kube-system.
#>
param(
    [string]$Context = 'docker-desktop',
    [string]$Namespace = 'react-app',
    [string]$KubesealPath = 'kubeseal',
    [string]$OutFile = (Join-Path $PSScriptRoot '..\helm\react-app\templates\relayops-db-sealedsecret.yaml')
)

$ErrorActionPreference = 'Stop'

$dbSecure = Read-Host 'Application database password' -AsSecureString
$rootSecure = Read-Host 'MySQL root password' -AsSecureString
$dbPassword = [System.Net.NetworkCredential]::new('', $dbSecure).Password
$rootPassword = [System.Net.NetworkCredential]::new('', $rootSecure).Password
if ([string]::IsNullOrEmpty($dbPassword) -or [string]::IsNullOrEmpty($rootPassword)) {
    throw 'Both passwords are required.'
}

function ConvertTo-Base64([string]$Value) {
    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Value))
}

$secretManifest = @"
apiVersion: v1
kind: Secret
metadata:
  name: relayops-db
  namespace: $Namespace
type: Opaque
data:
  password: $(ConvertTo-Base64 $dbPassword)
  root-password: $(ConvertTo-Base64 $rootPassword)
"@

$sealed = $secretManifest | & $KubesealPath --context $Context --controller-namespace kube-system --controller-name sealed-secrets-controller --format yaml
if ($LASTEXITCODE -ne 0) {
    throw 'kubeseal failed. Check the kubectl context and that the Sealed Secrets controller is running.'
}

$outPath = [IO.Path]::GetFullPath($OutFile)
$sealed | Set-Content -Path $outPath -Encoding utf8
Write-Host "Wrote $outPath"
Write-Host 'Review the file, then commit it so Argo CD can create the Secret.'
