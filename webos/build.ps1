$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $PSScriptRoot 'build/package/app'
$out = Join-Path $PSScriptRoot 'dist'
$assets = Join-Path $stage 'assets'
New-Item -ItemType Directory -Path $assets,$out -Force | Out-Null
$sources = 'appinfo.json','index.html','app.js','live-catalog.js','remote-input.js','scene.css'
foreach ($source in $sources) {
  Copy-Item (Join-Path "$PSScriptRoot/app" $source) $stage
}
$logos = New-Item -ItemType Directory -Path (Join-Path $stage 'logos') -Force
Copy-Item "$PSScriptRoot/app/logos/live-tv.svg" $logos.FullName
Copy-Item "$repo/app/src/main/assets/theme/wallpapers/*.jpg" $assets
Copy-Item "$repo/app/src/main/res/font/manrope.ttf","$repo/app/src/main/res/font/unbounded.ttf" $assets
Copy-Item "$repo/LICENSE","$repo/FONT-LICENSE-OFL.txt" $stage
$cli = Join-Path $repo '.lg-sdk/node_modules'
$sdkJs = Join-Path $cli '@webos-tools/cli/files/templates/tv-sdk-templates/bootplate-web/webOSTVjs-1.2.13'
Copy-Item "$sdkJs/webOSTV.js","$sdkJs/LICENSE-2.0.txt" $stage
Add-Type -AssemblyName System.Drawing
$original = [Drawing.Image]::FromFile((Join-Path $repo 'app/src/main/res/mipmap-xhdpi/ic_launcher.jpg'))
try {
  foreach ($asset in @(@('icon.png',80),@('largeIcon.png',130))) {
    $icon = [Drawing.Bitmap]::new($original,[int]$asset[1],[int]$asset[1])
    try {$icon.Save((Join-Path $stage $asset[0]),[Drawing.Imaging.ImageFormat]::Png)} finally {$icon.Dispose()}
  }
} finally {$original.Dispose()}
& "$cli/.bin/ares-package.cmd" --outdir $out $stage "$PSScriptRoot/service"
exit $LASTEXITCODE