param([string]$Script, [string]$Arg1, [string]$Arg2)
$ErrorActionPreference = 'Stop'
$out = Join-Path $env:TEMP 'dsh-asar-out.txt'
$err = Join-Path $env:TEMP 'dsh-asar-err.txt'
$env:ELECTRON_RUN_AS_NODE = '1'
$args = @($Script)
if ($Arg1) { $args += $Arg1 }
if ($Arg2) { $args += $Arg2 }
$p = Start-Process -FilePath $env:DSH_NODE_EXECUTABLE -ArgumentList $args -NoNewWindow -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
Get-Content $out -ErrorAction SilentlyContinue
$e = Get-Content $err -ErrorAction SilentlyContinue
if ($e) { [Console]::Error.WriteLine($e) }
exit $p.ExitCode
