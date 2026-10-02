# 判斷 dist/index.html 是否需要重新建置：不存在，或比原始碼舊 → 結束碼 1；否則 0。
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist\index.html'
if (-not (Test-Path $dist)) { exit 1 }
$built = (Get-Item $dist).LastWriteTime
$paths = @('src', 'index.html', 'package.json', 'vite.config.ts', 'tsconfig.json') | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ }
$newest = Get-ChildItem $paths -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($newest.LastWriteTime -gt $built) { exit 1 }
exit 0
