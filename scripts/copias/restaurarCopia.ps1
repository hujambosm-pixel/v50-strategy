# scripts/copias/restaurarCopia.ps1
#
# VENTANA «Restaurar una copia» (docs/builder.md §133). Se abre con el acceso directo «Restaurar copia»
# de Documentos\TradingSimulator_copias (restaurarCopia.vbs, sin consola).
#   «Probar (sin tocar nada)»: recupera la copia en una base aparte y la compara con su manifiesto.
#   «Restaurar…» → confirmación en la misma ventana → sustituye tus datos (antes guarda cómo estaba todo).
# Todo el trabajo lo hace restaurar.js; esta ventana solo pregunta y enseña cómo va.
# Solo para comprobarla: -Captura <png> la dibuja y se cierra; con -PulsaProbar, antes pulsa «Probar»;
# con -PulsaConfirmar, pulsa «Restaurar…» UNA vez (solo la pregunta: no restaura nada).

param([string]$Captura, [switch]$PulsaProbar, [switch]$PulsaConfirmar)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'restaurar.js'

function Nodo([string]$argumentos) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'node'
  $psi.Arguments = "`"$script`" $argumentos"
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
  return [System.Diagnostics.Process]::Start($psi)
}
function NodoYa([string]$argumentos) {
  $p = Nodo $argumentos
  $salida = $p.StandardOutput.ReadToEnd()
  $p.WaitForExit()
  return $salida.Trim()
}
function Arg([string]$ruta) { if ($ruta.EndsWith('\')) { $ruta = $ruta + '\' }; return "`"$ruta`"" }

$creada = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\TradingSimulatorRestaurar', [ref]$creada)
if (-not $creada -and -not $Captura) { exit 0 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$fuente = New-Object System.Drawing.Font('Segoe UI', 10)
$negrita = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$rojo = [System.Drawing.Color]::FromArgb(200, 30, 30)
$verde = [System.Drawing.Color]::FromArgb(22, 128, 61)
$azul = [System.Drawing.Color]::FromArgb(37, 99, 235)

$f = New-Object System.Windows.Forms.Form
$f.Text = 'Trading Simulator · Restaurar una copia'
$f.Size = New-Object System.Drawing.Size(640, 500)
$f.StartPosition = 'CenterScreen'
$f.FormBorderStyle = 'FixedDialog'
$f.MaximizeBox = $false
$f.Font = $fuente
$f.BackColor = [System.Drawing.Color]::White

$titulo = New-Object System.Windows.Forms.Label
$titulo.Location = New-Object System.Drawing.Point(20, 16)
$titulo.Size = New-Object System.Drawing.Size(590, 26)
$titulo.Font = $negrita
$titulo.Text = 'Restaurar una copia'
$f.Controls.Add($titulo)

$texto = New-Object System.Windows.Forms.Label
$texto.Location = New-Object System.Drawing.Point(20, 48)
$texto.Size = New-Object System.Drawing.Size(590, 60)
$texto.Text = "«Probar» comprueba que la copia se recupera entera, sin tocar tus datos.`r`n«Restaurar» sustituye tus datos por los de la copia (antes guarda cómo está todo ahora, para poder deshacerlo)."
$f.Controls.Add($texto)

$lista = New-Object System.Windows.Forms.ListBox
$lista.Location = New-Object System.Drawing.Point(20, 112)
$lista.Size = New-Object System.Drawing.Size(590, 110)
$f.Controls.Add($lista)

$btnOtra = New-Object System.Windows.Forms.Button
$btnOtra.Location = New-Object System.Drawing.Point(20, 228)
$btnOtra.Size = New-Object System.Drawing.Size(260, 30)
$btnOtra.Text = 'Buscar copias en un USB u otra carpeta…'
$f.Controls.Add($btnOtra)

$log = New-Object System.Windows.Forms.TextBox
$log.Location = New-Object System.Drawing.Point(20, 266)
$log.Size = New-Object System.Drawing.Size(590, 130)
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = 'Vertical'
$log.BackColor = [System.Drawing.Color]::FromArgb(245, 245, 245)
$f.Controls.Add($log)

$btnProbar = New-Object System.Windows.Forms.Button
$btnProbar.Location = New-Object System.Drawing.Point(20, 410)
$btnProbar.Size = New-Object System.Drawing.Size(190, 34)
$btnProbar.Text = 'Probar (sin tocar nada)'
$btnProbar.BackColor = $azul
$btnProbar.ForeColor = [System.Drawing.Color]::White
$btnProbar.FlatStyle = 'Flat'
$f.Controls.Add($btnProbar)

$btnRest = New-Object System.Windows.Forms.Button
$btnRest.Location = New-Object System.Drawing.Point(350, 410)
$btnRest.Size = New-Object System.Drawing.Size(130, 34)
$btnRest.Text = 'Restaurar…'
$f.Controls.Add($btnRest)

$btnCerrar = New-Object System.Windows.Forms.Button
$btnCerrar.Location = New-Object System.Drawing.Point(490, 410)
$btnCerrar.Size = New-Object System.Drawing.Size(120, 34)
$btnCerrar.Text = 'Cerrar'
$f.Controls.Add($btnCerrar)

$script:copias = @()
$script:proceso = $null
$script:lectura = $null
$script:confirmando = $false
$script:resultado = ''

function Escribe([string]$t) { $log.AppendText($t + "`r`n") }
function FechaBonita([string]$iso) {
  try { return ([datetime]::Parse($iso).ToLocalTime()).ToString('dd/MM/yyyy HH:mm') } catch { return $iso }
}

function CargaCopias([string]$otra) {
  $lista.Items.Clear()
  $arg = 'listar'
  if ($otra) { $arg = 'listar ' + (Arg $otra) }
  $script:copias = @(NodoYa $arg | ConvertFrom-Json | ForEach-Object { $_ } | Where-Object { $_ -and $_.ruta })
  foreach ($c in $script:copias) {
    $donde = switch ($c.tipo) { 'PC' { 'en el PC' } 'elegida' { "en $([System.IO.Path]::GetPathRoot($c.ruta))" } default { 'antes de restaurar' } }
    [void]$lista.Items.Add(('{0}  ·  {1}  ·  {2:N0} filas  ·  {3} MB' -f (FechaBonita $c.hecha), $donde, $c.filas, $c.mb))
  }
  if ($lista.Items.Count -gt 0) { $lista.SelectedIndex = 0; $btnProbar.Enabled = $true; $btnRest.Enabled = $true }
  else { Escribe 'No encuentro ninguna copia. Usa «Buscar copias en un USB u otra carpeta…».'; $btnProbar.Enabled = $false; $btnRest.Enabled = $false }
}

function ModoNormal {
  $script:confirmando = $false
  $titulo.ForeColor = [System.Drawing.Color]::Black
  $btnRest.Text = 'Restaurar…'; $btnRest.BackColor = [System.Drawing.SystemColors]::Control; $btnRest.ForeColor = [System.Drawing.Color]::Black; $btnRest.FlatStyle = 'Standard'
  $btnCerrar.Text = 'Cerrar'
  $btnProbar.Visible = $true; $lista.Enabled = $true; $btnOtra.Enabled = $true
}

function Lanza([string]$modo) {
  $c = $script:copias[$lista.SelectedIndex]
  $log.Text = ''
  $script:resultado = ''
  $btnProbar.Enabled = $false; $btnRest.Enabled = $false; $btnCerrar.Enabled = $false; $btnOtra.Enabled = $false; $lista.Enabled = $false
  $f.UseWaitCursor = $true
  $script:proceso = Nodo ((Arg $c.ruta) + ' ' + $modo)
  $script:lectura = $script:proceso.StandardOutput.ReadLineAsync()
  $timer.Start()
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
  if ($script:lectura -ne $null -and $script:lectura.IsCompleted) {
    $linea = $script:lectura.Result
    if ($linea -ne $null) {
      if ($linea.StartsWith('PASO: ')) { Escribe ('· ' + $linea.Substring(6)) }
      elseif ($linea.StartsWith('OK: ')) {
        Escribe ''; Escribe ('✓ ' + $linea.Substring(4))
        $script:resultado = 'ok'
      }
      elseif ($linea.StartsWith('FALLO: ')) {
        Escribe ''; Escribe ('✗ ' + $linea.Substring(7))
        $script:resultado = 'fallo'
      }
      else { Escribe $linea }
      $script:lectura = $script:proceso.StandardOutput.ReadLineAsync()
    } else {
      $timer.Stop()
      $script:proceso.WaitForExit()
      $err = $script:proceso.StandardError.ReadToEnd().Trim()
      if ($err) { Escribe $err }
      $script:lectura = $null
      $f.UseWaitCursor = $false
      $fueVerdad = $script:confirmando
      ModoNormal
      if ($script:resultado -eq 'ok') {
        $titulo.Text = if ($fueVerdad) { '✓ Copia restaurada' } else { '✓ La copia se puede restaurar entera' }
        $titulo.ForeColor = $verde
      } else {
        $titulo.Text = '✗ Algo ha fallado'
        $titulo.ForeColor = $rojo
      }
      $btnProbar.Enabled = $true; $btnRest.Enabled = $true; $btnCerrar.Enabled = $true; $btnOtra.Enabled = $true; $lista.Enabled = $true
    }
  }
})

$btnOtra.Add_Click({
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
  $dlg.Description = 'Elige el USB o la carpeta donde están las copias (o una copia concreta)'
  if ($dlg.ShowDialog($f) -eq 'OK') { $log.Text = ''; CargaCopias $dlg.SelectedPath }
})

$btnProbar.Add_Click({ if ($lista.SelectedIndex -ge 0) { $titulo.Text = 'Probando la copia…'; Lanza '--prueba' } })

$btnRest.Add_Click({
  if ($lista.SelectedIndex -lt 0) { return }
  if (-not $script:confirmando) {
    # Paso 1: confirmar en la misma ventana.
    $script:confirmando = $true
    $c = $script:copias[$lista.SelectedIndex]
    $titulo.Text = "¿Sustituir tus datos por la copia del $(FechaBonita $c.hecha)?"
    $titulo.ForeColor = $rojo
    $log.Text = "Lo que hayas hecho en la app después de esa copia se perderá (quedará guardado en «antes de restaurar», por si quieres volver atrás).`r`nTendrás que volver a iniciar sesión en la app.`r`nTarda uno o dos minutos."
    $btnRest.Text = 'Sí, restaurar'; $btnRest.BackColor = $rojo; $btnRest.ForeColor = [System.Drawing.Color]::White; $btnRest.FlatStyle = 'Flat'
    $btnCerrar.Text = 'Cancelar'
    $log.SelectionLength = 0; $f.ActiveControl = $btnCerrar
    $btnProbar.Visible = $false; $lista.Enabled = $false; $btnOtra.Enabled = $false
    return
  }
  $titulo.Text = 'Restaurando…'
  Lanza '--de-verdad'
})

$btnCerrar.Add_Click({
  if ($script:confirmando -and $script:proceso -eq $null) { ModoNormal; $titulo.Text = 'Restaurar una copia'; $log.Text = ''; return }
  if ($script:confirmando -and $script:proceso.HasExited) { ModoNormal; $titulo.Text = 'Restaurar una copia'; $log.Text = ''; return }
  $f.Close()
})

$f.Add_FormClosing({
  param($s, $e)
  if ($script:proceso -ne $null -and -not $script:proceso.HasExited) {
    Escribe 'Espera a que termine: no cierres todavía.'
    $e.Cancel = $true
  }
})

CargaCopias ''

function Captura {
  $f.Refresh()
  $bmp = New-Object System.Drawing.Bitmap($f.Width, $f.Height)
  $f.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $f.Width, $f.Height)))
  $bmp.Save($Captura, [System.Drawing.Imaging.ImageFormat]::Png)
  $f.Close()
}
if ($Captura -and $PulsaProbar) {
  $f.Add_Shown({ $btnProbar.PerformClick() })
  $vigia = New-Object System.Windows.Forms.Timer
  $vigia.Interval = 500
  $vigia.Add_Tick({ if ($script:proceso -ne $null -and $script:lectura -eq $null) { $vigia.Stop(); Captura } })
  $vigia.Start()
} elseif ($Captura -and $PulsaConfirmar) {
  $f.Add_Shown({ $btnRest.PerformClick(); Captura })
} elseif ($Captura) {
  $f.Add_Shown({ Captura })
}
[void]$f.ShowDialog()
if ($creada) { $mutex.ReleaseMutex() }
