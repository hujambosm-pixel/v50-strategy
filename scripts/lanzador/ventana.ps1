# scripts/lanzador/ventana.ps1
#
# Ventana de progreso del LANZADOR (docs/builder.md §134). La abren los accesos directos del
# Escritorio a través de lanzador.vbs (sin consola):
#   -Accion arrancar   «Trading Simulator»: enciende todo y abre la app en el navegador
#   -Accion parar      «Parar Trading Simulator»: copia de hoy, apaga la app, la base y Docker
# Todo el trabajo lo hace lanzador.js. Si sale bien, la ventana se cierra sola a los 4 segundos.
# Solo para comprobarla: -Captura <png> (dibuja la ventana al terminar y se cierra) y -SinNavegador.

param([ValidateSet('arrancar', 'parar')][string]$Accion = 'arrancar', [string]$Captura, [switch]$SinNavegador)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'lanzador.js'

$creada = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\TradingSimulatorLanzador', [ref]$creada)
if (-not $creada -and -not $Captura) { exit 0 }   # ya hay una ventana del lanzador trabajando

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$f = New-Object System.Windows.Forms.Form
$f.Text = 'Trading Simulator'
$f.Size = New-Object System.Drawing.Size(560, 360)
$f.StartPosition = 'CenterScreen'
$f.FormBorderStyle = 'FixedDialog'
$f.MaximizeBox = $false
$f.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$f.BackColor = [System.Drawing.Color]::White

$titulo = New-Object System.Windows.Forms.Label
$titulo.Location = New-Object System.Drawing.Point(20, 16)
$titulo.Size = New-Object System.Drawing.Size(510, 28)
$titulo.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$titulo.Text = if ($Accion -eq 'arrancar') { 'Encendiendo Trading Simulator…' } else { 'Apagando Trading Simulator…' }
$f.Controls.Add($titulo)

$log = New-Object System.Windows.Forms.TextBox
$log.Location = New-Object System.Drawing.Point(20, 54)
$log.Size = New-Object System.Drawing.Size(510, 200)
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = 'Vertical'
$log.BackColor = [System.Drawing.Color]::FromArgb(245, 245, 245)
$f.Controls.Add($log)

$btn = New-Object System.Windows.Forms.Button
$btn.Location = New-Object System.Drawing.Point(410, 266)
$btn.Size = New-Object System.Drawing.Size(120, 34)
$btn.Text = 'Cerrar'
$btn.Enabled = $false
$f.Controls.Add($btn)
$btn.Add_Click({ $f.Close() })

function Escribe([string]$t) { $log.AppendText($t + "`r`n") }

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'node'
$psi.Arguments = "`"$script`" $Accion" + $(if ($SinNavegador) { ' --sin-navegador' } else { '' })
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8

$script:proceso = $null
$script:lectura = $null
$script:bien = $false
$script:cuenta = -1

function Captura {
  $f.Refresh()
  $bmp = New-Object System.Drawing.Bitmap($f.Width, $f.Height)
  $f.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $f.Width, $f.Height)))
  $bmp.Save($Captura, [System.Drawing.Imaging.ImageFormat]::Png)
  $f.Close()
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
  if ($script:cuenta -ge 0) {
    # Cuenta atrás para cerrarse sola tras salir bien.
    $script:cuenta -= 1
    if ($script:cuenta % 5 -eq 0) { $btn.Text = "Cerrar ($([math]::Ceiling($script:cuenta / 5)))" }
    if ($script:cuenta -le 0) { $timer.Stop(); $f.Close() }
    return
  }
  if ($script:lectura -ne $null -and $script:lectura.IsCompleted) {
    $linea = $script:lectura.Result
    if ($linea -ne $null) {
      if ($linea.StartsWith('PASO: ')) { Escribe ('· ' + $linea.Substring(6)) }
      elseif ($linea.StartsWith('OK: ')) { Escribe ''; Escribe ('✓ ' + $linea.Substring(4)); $script:bien = $true }
      elseif ($linea.StartsWith('FALLO: ')) { Escribe ''; Escribe ('✗ ' + $linea.Substring(7)) }
      else { Escribe $linea }
      $script:lectura = $script:proceso.StandardOutput.ReadLineAsync()
    } else {
      $script:proceso.WaitForExit()
      $err = $script:proceso.StandardError.ReadToEnd().Trim()
      if ($err) { Escribe $err }
      $script:lectura = $null
      $f.UseWaitCursor = $false
      $btn.Enabled = $true
      $f.AcceptButton = $btn
      if ($script:bien) {
        $titulo.Text = if ($Accion -eq 'arrancar') { '✓ Trading Simulator encendido' } else { '✓ Trading Simulator apagado' }
        $titulo.ForeColor = [System.Drawing.Color]::FromArgb(22, 128, 61)
        if ($Captura) { $timer.Stop(); Captura; return }
        $script:cuenta = 20   # 20 × 200 ms = 4 s
      } else {
        $titulo.Text = '✗ Algo ha fallado'
        $titulo.ForeColor = [System.Drawing.Color]::FromArgb(200, 30, 30)
        $timer.Stop()
        if ($Captura) { Captura }
      }
    }
  }
})

$f.Add_Shown({
  $f.UseWaitCursor = $true
  $script:proceso = [System.Diagnostics.Process]::Start($psi)
  $script:lectura = $script:proceso.StandardOutput.ReadLineAsync()
  $timer.Start()
})
$f.Add_FormClosing({
  param($s, $e)
  if ($script:proceso -ne $null -and -not $script:proceso.HasExited) {
    Escribe 'Espera a que termine: no cierres todavía.'
    $e.Cancel = $true
  }
})

[void]$f.ShowDialog()
if ($creada) { $mutex.ReleaseMutex() }
