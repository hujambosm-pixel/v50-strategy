# scripts/lanzador/instala.ps1
#
# Crea en el Escritorio los accesos directos «Trading Simulator» (enciende todo y abre la app) y
# «Parar Trading Simulator» (copia de hoy y apaga todo). Ver docs/builder.md §134.
# §147: y «Parar solo la app» (la base de datos y Docker siguen encendidos: para compilar y pasar las comprobaciones).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lanzador\instala.ps1

$escritorio = [Environment]::GetFolderPath('Desktop')
$vbs = Join-Path $PSScriptRoot 'lanzador.vbs'
$wsh = New-Object -ComObject WScript.Shell

$a = $wsh.CreateShortcut((Join-Path $escritorio 'Trading Simulator.lnk'))
$a.TargetPath = 'wscript.exe'
$a.Arguments = '"' + $vbs + '" arrancar'
$a.WorkingDirectory = $PSScriptRoot
$a.IconLocation = 'shell32.dll,12'
$a.Description = 'Enciende Docker, la base de datos y la app, y abre Trading Simulator en el navegador'
$a.Save()

$p = $wsh.CreateShortcut((Join-Path $escritorio 'Parar Trading Simulator.lnk'))
$p.TargetPath = 'wscript.exe'
$p.Arguments = '"' + $vbs + '" parar'
$p.WorkingDirectory = $PSScriptRoot
$p.IconLocation = 'shell32.dll,27'
$p.Description = 'Hace la copia de hoy y apaga la app, la base de datos y Docker (los datos se quedan)'
$p.Save()

$s = $wsh.CreateShortcut((Join-Path $escritorio 'Parar solo la app.lnk'))
$s.TargetPath = 'wscript.exe'
$s.Arguments = '"' + $vbs + '" parar-app'
$s.WorkingDirectory = $PSScriptRoot
$s.IconLocation = 'shell32.dll,131'
$s.Description = 'Apaga solo la app de Trading Simulator; la base de datos y Docker siguen encendidos'
$s.Save()

Write-Output "Accesos directos creados en $escritorio"
