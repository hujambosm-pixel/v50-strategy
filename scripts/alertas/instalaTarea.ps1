# scripts/alertas/instalaTarea.ps1
#
# Crea (o rehace) la tarea programada de Windows «TradingSimulator - alertas» (docs/builder.md §217):
#   - de lunes a viernes, de 09:00 a 23:00 (hora de España), cada 15 minutos: cubre las bolsas europeas y Wall Street
#     (15:30-22:00, o 14:30-21:00 las semanas en que EE. UU. cambia la hora antes que España) y las pasadas tras el cierre;
#   - lanza comprobador.vbs (sin ventana); si la base local está apagada, no hace nada.
# Es del usuario que la instala, sin permisos de administrador.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\alertas\instalaTarea.ps1           crea o rehace
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\alertas\instalaTarea.ps1 -Quitar   la quita

param([switch]$Quitar)

$nombre = 'TradingSimulator - alertas'
$vbs = Join-Path $PSScriptRoot 'comprobador.vbs'
$usuario = "$env:USERDOMAIN\$env:USERNAME"

if (Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $nombre -Confirm:$false
}
if ($Quitar) { Write-Output "Tarea quitada: $nombre"; exit 0 }

$accion = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`"" -WorkingDirectory $PSScriptRoot
$cada15 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At '09:00'
# La repetición se copia de un disparador de una vez (New-ScheduledTaskTrigger -Weekly no la admite directamente).
$rep = New-ScheduledTaskTrigger -Once -At '09:00' -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Hours 14)
$cada15.Repetition = $rep.Repetition
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$quien = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $cada15 -Settings $ajustes -Principal $quien `
  -Description 'Alertas de Trading Simulator (scripts/alertas/comprobador.js): mira los precios y avisa con una notificacion de Windows. Si la base local esta apagada, no hace nada.' | Out-Null

$t = Get-ScheduledTask -TaskName $nombre
Write-Output "Tarea creada: $nombre ($($t.State)); proxima: $((Get-ScheduledTaskInfo -TaskName $nombre).NextRunTime)"
