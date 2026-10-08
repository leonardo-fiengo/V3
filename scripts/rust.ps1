param([ValidateSet('test','types','check','desktop','build','native','v2','migration','portable','installer')][string]$Task = 'test', [string]$Source, [string]$BuildConfig)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localTools = Join-Path $projectRoot '.tools'
if (Test-Path (Join-Path $localTools 'cargo/bin/cargo.exe')) {
    $env:RUSTUP_HOME = Join-Path $localTools 'rustup'
    $env:CARGO_HOME = Join-Path $localTools 'cargo'
    $env:PATH = (Join-Path $localTools 'cargo/bin') + ';C:/MSYS2/ucrt64/bin;' + $env:PATH
    if ($projectRoot.Contains("'")) {
        $aliasDrive = 'R:'
        $existing = & subst
        if ($existing -and ($existing | Select-String '^R:') -and -not ($existing | Select-String -SimpleMatch $projectRoot)) { throw 'R: is occupied. Use a workspace path without apostrophes.' }
        if (-not (Test-Path 'R:/scripts/linker.cmd')) { & subst $aliasDrive $projectRoot }
        $env:MM_BUILD_ROOT = $projectRoot
        $env:MM_BUILD_ALIAS = 'R:'
        if (-not (Test-Path 'R:/.tools/build-bin/windres.exe')) { & 'C:/MSYS2/ucrt64/bin/gcc.exe' 'R:/scripts/windres.c' -o 'R:/.tools/build-bin/windres.exe'; if ($LASTEXITCODE -ne 0) { throw 'Resource wrapper compilation failed.' } }
        $env:PATH = 'R:/.tools/build-bin;' + $env:PATH
        if (-not (Test-Path 'R:/.tools/ld.lld.exe')) { Copy-Item -LiteralPath (Join-Path $env:RUSTUP_HOME 'toolchains/stable-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/bin/rust-lld.exe') -Destination 'R:/.tools/ld.lld.exe' }
        $env:MM_LINKER = 'R:/.tools/ld.lld.exe'
        $env:RUSTFLAGS = '-C linker-flavor=ld -C link-self-contained=yes -L native=R:/.tools/rustup/toolchains/stable-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained'
        $env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = 'R:/scripts/linker.cmd'
    }
}
Push-Location (Join-Path $projectRoot 'src-tauri')
try {
    switch ($Task) {
        'migration' { cargo test --no-default-features --test migration }
        'test' { cargo test --no-default-features }
        'v2' { if (-not $Source) { throw 'Specify -Source with a V2 SQLite file.' }; cargo run --no-default-features --example verify_v2 -- $Source }
        'types' { cargo run --no-default-features --example export_types }
        'check' { cargo check }
        'native' { cargo build }
        'installer' { Pop-Location; Push-Location $projectRoot; if ($BuildConfig) { npm.cmd run tauri build -- --debug --config $BuildConfig } else { npm.cmd run tauri build -- --debug } }
        'portable' { Pop-Location; Push-Location $projectRoot; npm.cmd run tauri build -- --debug --no-bundle }
        'desktop' { Pop-Location; Push-Location $projectRoot; npm.cmd run desktop }
        'build' { Pop-Location; Push-Location $projectRoot; if ($BuildConfig) { npm.cmd run tauri build -- --config $BuildConfig } else { npm.cmd run tauri build } }
    }
    if ($LASTEXITCODE -ne 0) { throw "Rust task failed with code $LASTEXITCODE" }
} finally { Pop-Location }
