# scripts/copias/instalaTarea.ps1
#
# Crea (o rehace) la tarea programada de Windows «TradingSimulator - copia diaria»:
#   - al iniciar sesión y cada hora,
#   - lanza copiaDiaria.vbs (sin ventana), que copia la base solo si está encendida y aún no hay copia de hoy.
# Es del usuario que la instala, sin permisos de administrador. Ver docs/builder.md §130.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\copias\instalaTarea.ps1           crea o rehace
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\copias\instalaTarea.ps1 -Quitar   la quita

param([switch]$Quitar)

$nombre = 'TradingSimulator - copia diaria'
$vbs = Join-Path $PSScriptRoot 'copiaDiaria.vbs'
$usuario = "$env:USERDOMAIN\$env:USERNAME"

if (Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $nombre -Confirm:$false
}
if ($Quitar) { Write-Output "Tarea quitada: $nombre"; exit 0 }

$accion = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`"" -WorkingDirectory $PSScriptRoot
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User $usuario
$alEntrar.Delay = 'PT5M'   # 5 minutos tras iniciar sesión: que Docker tenga tiempo de arrancar
$cadaHora = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1)
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$quien = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger @($alEntrar, $cadaHora) -Settings $ajustes -Principal $quien `
  -Description 'Copia diaria de la base local de Trading Simulator (scripts/copias/copiaDiaria.js). Solo copia si la base esta encendida y aun no hay copia de hoy.' | Out-Null

# Acceso directo «Copiar al USB ahora» en la carpeta de las copias (abre la ventana del USB cuando quieras).
$carpetaCopias = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'TradingSimulator_copias'
New-Item -ItemType Directory -Force $carpetaCopias | Out-Null
$wsh = New-Object -ComObject WScript.Shell
$acceso = $wsh.CreateShortcut((Join-Path $carpetaCopias 'Copiar al USB ahora.lnk'))
$acceso.TargetPath = 'wscript.exe'
$acceso.Arguments = '"' + (Join-Path $PSScriptRoot 'avisoUsb.vbs') + '"'
$acceso.WorkingDirectory = $PSScriptRoot
$acceso.IconLocation = 'shell32.dll,7'
$acceso.Description = 'Abre la ventana para guardar la copia de seguridad en el USB'
$acceso.Save()

# Acceso directo «Restaurar copia» (elige una copia del PC, de un USB o de otra carpeta; «Probar» o «Restaurar»).
$acceso2 = $wsh.CreateShortcut((Join-Path $carpetaCopias 'Restaurar copia.lnk'))
$acceso2.TargetPath = 'wscript.exe'
$acceso2.Arguments = '"' + (Join-Path $PSScriptRoot 'restaurarCopia.vbs') + '"'
$acceso2.WorkingDirectory = $PSScriptRoot
$acceso2.IconLocation = 'shell32.dll,238'
$acceso2.Description = 'Comprueba o restaura una copia de seguridad de Trading Simulator'
$acceso2.Save()

$t = Get-ScheduledTask -TaskName $nombre
Write-Output "Tarea creada: $nombre ($($t.State)); proxima: $((Get-ScheduledTaskInfo -TaskName $nombre).NextRunTime)"
