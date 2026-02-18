param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectPath,
  [string]$AppId,
  [string]$AppName,
  [string]$WebDir = "dist"
)

$ErrorActionPreference = "Stop"

function Assert-PathExists {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$Message
  )
  if (-not (Test-Path $PathValue)) {
    throw $Message
  }
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$ScriptBlock,
    [Parameter(Mandatory = $true)][string]$StepName
  )
  Write-Host "==> $StepName" -ForegroundColor Cyan
  & $ScriptBlock
}

$scriptRoot = $PSScriptRoot
$toolchainRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
$javaHome = Join-Path $toolchainRoot ".tools\jdk-21.0.10+7"
$androidHome = Join-Path $toolchainRoot ".android-sdk"

Assert-PathExists -PathValue $javaHome -Message "JDK 21 bulunamadi: $javaHome"
Assert-PathExists -PathValue $androidHome -Message "Android SDK bulunamadi: $androidHome"

$resolvedProjectPath = (Resolve-Path $ProjectPath).Path
$packageJsonPath = Join-Path $resolvedProjectPath "package.json"
Assert-PathExists -PathValue $packageJsonPath -Message "package.json bulunamadi: $resolvedProjectPath"

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$env:Path = "$javaHome\bin;$androidHome\platform-tools;$env:Path"

$capConfigTs = Join-Path $resolvedProjectPath "capacitor.config.ts"
$capConfigJson = Join-Path $resolvedProjectPath "capacitor.config.json"
$androidDir = Join-Path $resolvedProjectPath "android"

Push-Location $resolvedProjectPath
try {
  Invoke-Checked -StepName "Capacitor paketlerini kur" -ScriptBlock {
    & npm.cmd install @capacitor/core @capacitor/cli @capacitor/android
  }

  if (-not (Test-Path $capConfigTs) -and -not (Test-Path $capConfigJson)) {
    if ([string]::IsNullOrWhiteSpace($AppId) -or [string]::IsNullOrWhiteSpace($AppName)) {
      throw "capacitor.config yok. Ilk kurulum icin -AppId ve -AppName vermelisin."
    }
    Invoke-Checked -StepName "Capacitor init" -ScriptBlock {
      & npx.cmd cap init $AppName $AppId --web-dir $WebDir
    }
  }

  Invoke-Checked -StepName "Web build al" -ScriptBlock {
    & npm.cmd run build
  }

  if (-not (Test-Path $androidDir)) {
    Invoke-Checked -StepName "Android platform ekle" -ScriptBlock {
      & npx.cmd cap add android
    }
  }

  Invoke-Checked -StepName "Android senkronize et" -ScriptBlock {
    & npx.cmd cap sync android
  }

  $androidLocalProperties = Join-Path $androidDir "local.properties"
  $sdkDirForGradle = $androidHome -replace '\\', '/'
  Set-Content -Path $androidLocalProperties -Value "sdk.dir=$sdkDirForGradle" -NoNewline

  Push-Location $androidDir
  try {
    Invoke-Checked -StepName "APK (debug) build et" -ScriptBlock {
      & .\gradlew.bat assembleDebug
    }
  }
  finally {
    Pop-Location
  }

  $apkSource = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
  Assert-PathExists -PathValue $apkSource -Message "APK olusmadi: $apkSource"

  $projectName = Split-Path $resolvedProjectPath -Leaf
  $apkTarget = Join-Path $resolvedProjectPath "$projectName-debug.apk"
  Copy-Item -Path $apkSource -Destination $apkTarget -Force

  Write-Host ""
  Write-Host "Tamamlandi." -ForegroundColor Green
  Write-Host "APK: $apkTarget" -ForegroundColor Green
}
finally {
  Pop-Location
}
