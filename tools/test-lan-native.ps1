$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$output = Join-Path $repo '.tmp/lan-java'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$javaCommand = (Get-Command java).Source
$javaBin = Split-Path $javaCommand -Parent
& (Join-Path $javaBin 'javac.exe') -encoding UTF-8 -d $output (Join-Path $repo 'android/app/src/main/java/mx/mythicclash/game/LanTransport.java') (Join-Path $PSScriptRoot 'LanTransportTest.java')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $javaCommand -cp $output LanTransportTest
exit $LASTEXITCODE
