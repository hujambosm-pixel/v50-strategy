# scripts/alertas/notificacion.ps1 - la notificacion de Windows de las alertas (docs/builder.md §217).
# La lanza comprobador.js:  powershell -NoProfile -ExecutionPolicy Bypass -File notificacion.ps1 -Datos <base64 de [{ titulo, texto }]>
# Los textos llegan en base64 (UTF-8) para que no se pierdan los acentos. Pulsar la notificacion abre la app (http://localhost:3000).
# Usa el remitente de Windows PowerShell (sale como "Windows PowerShell"), sin instalar nada.
param([Parameter(Mandatory = $true)][string]$Datos)

$ErrorActionPreference = 'Stop'
$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Datos))
$avisos = @($json | ConvertFrom-Json)

[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$remitente = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
$notificador = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($remitente)

function Escapa([string]$t) { if ($null -eq $t) { return '' }; return [System.Security.SecurityElement]::Escape($t) }

foreach ($a in $avisos) {
  if ($null -eq $a -or -not $a.titulo) { continue }
  $xml = @"
<toast activationType="protocol" launch="http://localhost:3000/">
  <visual><binding template="ToastGeneric">
    <text>$(Escapa $a.titulo)</text>
    <text>$(Escapa $a.texto)</text>
    <text placement="attribution">Trading Simulator · alertas</text>
  </binding></visual>
  <audio src="ms-winsoundevent:Notification.Default"/>
</toast>
"@
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml($xml)
  $notificador.Show([Windows.UI.Notifications.ToastNotification]::new($doc))
}
