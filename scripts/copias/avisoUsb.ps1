# scripts/copias/avisoUsb.ps1
#
# VENTANA «Copia de seguridad en el USB» (docs/builder.md §131).
#   -SiToca   solo se abre si toca (15 días desde la última copia en el USB y sin «Recordar mañana»
#             pendiente). Así la lanza cada hora la tarea programada, tras la copia diaria.
#   sin nada  se abre siempre (acceso directo «Copiar al USB ahora»).
# Todo el trabajo lo hace copiaUsb.js; esta ventana solo pregunta y enseña cómo va.
# Cerrar con la X sin copiar, cuando la abrió el aviso, cuenta como «Recordar mañana».

param([switch]$SiToca, [string]$Captura, [switch]$PulsaCopiar)
# Solo para comprobarla: -Captura <archivo.png> dibuja la ventana en esa imagen y se cierra sola;
# con -PulsaCopiar, antes pulsa «Copiar» y la dibuja cuando termina.

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'copiaUsb.js'

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

# Una sola ventana a la vez (la tarea pasa cada hora).
$creada = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\TradingSimulatorAvisoUsb', [ref]$creada)
if (-not $creada) { exit 0 }

try {
  $estado = NodoYa 'estado' | ConvertFrom-Json
} catch { exit 1 }
if ($SiToca -and -not $estado.toca) { exit 0 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

function FechaBonita([string]$f) { if (-not $f) { return '' }; $p = $f.Split('-'); return "$($p[2])/$($p[1])/$($p[0])" }

$fuente = New-Object System.Drawing.Font('Segoe UI', 10)
$negrita = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)

$f = New-Object System.Windows.Forms.Form
$f.Text = 'Trading Simulator · Copia de seguridad en el USB'
$f.Size = New-Object System.Drawing.Size(600, 420)
$f.StartPosition = 'CenterScreen'
$f.FormBorderStyle = 'FixedDialog'
$f.MaximizeBox = $false
$f.MinimizeBox = $true
$f.TopMost = $true
$f.Font = $fuente
$f.BackColor = [System.Drawing.Color]::White

$titulo = New-Object System.Windows.Forms.Label
$titulo.Location = New-Object System.Drawing.Point(20, 16)
$titulo.Size = New-Object System.Drawing.Size(550, 26)
$titulo.Font = $negrita
$f.Controls.Add($titulo)

$texto = New-Object System.Windows.Forms.Label
$texto.Location = New-Object System.Drawing.Point(20, 48)
$texto.Size = New-Object System.Drawing.Size(550, 66)
$f.Controls.Add($texto)

# Elegir el USB (solo la primera vez).
$lblUsb = New-Object System.Windows.Forms.Label
$lblUsb.Location = New-Object System.Drawing.Point(20, 120)
$lblUsb.Size = New-Object System.Drawing.Size(150, 24)
$lblUsb.Text = 'Tu USB de copias:'
$f.Controls.Add($lblUsb)
$combo = New-Object System.Windows.Forms.ComboBox
$combo.Location = New-Object System.Drawing.Point(170, 117)
$combo.Size = New-Object System.Drawing.Size(290, 26)
$combo.DropDownStyle = 'DropDownList'
$f.Controls.Add($combo)
$btnAct = New-Object System.Windows.Forms.Button
$btnAct.Location = New-Object System.Drawing.Point(470, 116)
$btnAct.Size = New-Object System.Drawing.Size(100, 28)
$btnAct.Text = 'Actualizar'
$f.Controls.Add($btnAct)

$log = New-Object System.Windows.Forms.TextBox
$log.Location = New-Object System.Drawing.Point(20, 154)
$log.Size = New-Object System.Drawing.Size(550, 150)
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = 'Vertical'
$log.BackColor = [System.Drawing.Color]::FromArgb(245, 245, 245)
$f.Controls.Add($log)

$btnCopiar = New-Object System.Windows.Forms.Button
$btnCopiar.Location = New-Object System.Drawing.Point(330, 320)
$btnCopiar.Size = New-Object System.Drawing.Size(110, 34)
$btnCopiar.Text = 'Copiar'
$btnCopiar.BackColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
$btnCopiar.ForeColor = [System.Drawing.Color]::White
$btnCopiar.FlatStyle = 'Flat'
$f.Controls.Add($btnCopiar)
$btnLuego = New-Object System.Windows.Forms.Button
$btnLuego.Location = New-Object System.Drawing.Point(450, 320)
$btnLuego.Size = New-Object System.Drawing.Size(120, 34)
$btnLuego.Text = 'Recordar mañana'
$f.Controls.Add($btnLuego)
$f.AcceptButton = $btnCopiar

$script:unidades = @()
$script:hecho = $false
$script:proceso = $null
$script:lectura = $null

function Escribe([string]$t) { $log.AppendText($t + "`r`n") }

function CargaUnidades {
  $combo.Items.Clear()
  $script:unidades = @(NodoYa 'unidades' | ConvertFrom-Json)
  foreach ($u in $script:unidades) {
    $gb = [math]::Round($u.libres / 1GB, 1)
    [void]$combo.Items.Add("$($u.raiz)  $($u.nombre)  ($gb GB libres)")
  }
  if ($combo.Items.Count -gt 0) { $combo.SelectedIndex = 0; $log.Text = '' }
  else { $log.Text = "No veo ningún USB conectado. Conéctalo y pulsa «Actualizar».`r`n" }
}

$frase = if ($estado.diasDesdeUsb -eq $null) { 'Aún no hay ninguna copia en el USB.' }
         else { "La última copia en el USB es del $(FechaBonita $estado.ultimaCopiaUsb) (hace $($estado.diasDesdeUsb) días)." }
$titulo.Text = if ($estado.toca) { 'Toca guardar la copia en el USB' } else { 'Copia en el USB' }
if (-not $estado.ultimaDiaria) {
  $texto.Text = "Todavía no hay ninguna copia diaria en el PC: no hay nada que pasar al USB."
  $btnCopiar.Enabled = $false
} elseif ($estado.usbElegido) {
  $nombre = if ($estado.usbNombre) { " «$($estado.usbNombre)»" } else { '' }
  $texto.Text = "$frase`r`nConecta tu USB de copias$nombre y pulsa «Copiar». Se pasará la copia del PC del $(FechaBonita $estado.ultimaDiaria) y se comprobará que llega entera."
  $lblUsb.Visible = $false; $combo.Visible = $false; $btnAct.Visible = $false
  $log.Location = New-Object System.Drawing.Point(20, 120)
  $log.Size = New-Object System.Drawing.Size(550, 184)
} else {
  $texto.Text = "$frase`r`nPrimera vez: conecta el USB que usarás para las copias, elígelo y pulsa «Copiar». Se dejará en él un archivo de marca para no equivocarse nunca de disco."
  CargaUnidades
}

$btnAct.Add_Click({ CargaUnidades })

$btnLuego.Add_Click({
  if ($script:hecho) { $f.Close(); return }
  $r = NodoYa 'recordar'
  $script:hecho = $true
  $f.Close()
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
  if ($script:lectura -ne $null -and $script:lectura.IsCompleted) {
    $linea = $script:lectura.Result
    if ($linea -ne $null) {
      if ($linea.StartsWith('PASO: ')) { Escribe ('· ' + $linea.Substring(6)) }
      elseif ($linea.StartsWith('OK: ')) {
        Escribe ''; Escribe ('✓ ' + $linea.Substring(4))
        $titulo.Text = '✓ Copia guardada en el USB'
        $texto.Text = 'Listo. El próximo aviso llegará dentro de 15 días. Guarda el USB en un sitio seguro.'
        $titulo.ForeColor = [System.Drawing.Color]::FromArgb(22, 128, 61)
        $script:hecho = $true
      }
      elseif ($linea.StartsWith('FALLO: ')) {
        Escribe ''; Escribe ('✗ ' + $linea.Substring(7))
        $titulo.Text = '✗ No se ha podido copiar'
        $titulo.ForeColor = [System.Drawing.Color]::FromArgb(200, 30, 30)
      }
      else { Escribe $linea }
      $script:lectura = $script:proceso.StandardOutput.ReadLineAsync()
    } else {
      # Terminó.
      $timer.Stop()
      $script:proceso.WaitForExit()
      $err = $script:proceso.StandardError.ReadToEnd().Trim()
      if ($err) { Escribe $err }
      $script:lectura = $null
      $f.UseWaitCursor = $false
      if ($script:hecho) {
        $btnLuego.Text = 'Cerrar'; $btnLuego.Enabled = $true; $btnCopiar.Visible = $false
        $f.AcceptButton = $btnLuego
      } else {
        $btnCopiar.Enabled = $true; $btnLuego.Enabled = $true; $btnAct.Enabled = $true; $combo.Enabled = $true
      }
    }
  }
})

$btnCopiar.Add_Click({
  $log.Text = ''
  $titulo.ForeColor = [System.Drawing.Color]::Black
  if (-not $estado.usbElegido) {
    if ($combo.SelectedIndex -lt 0) { Escribe 'Primero conecta el USB, pulsa «Actualizar» y elígelo.'; return }
    $u = $script:unidades[$combo.SelectedIndex]
    $r = NodoYa "marcar `"$($u.raiz.TrimEnd('\'))\\`""
    Escribe $r
    if (-not $r.StartsWith('OK')) { return }
    $estado.usbElegido = $true
  }
  $btnCopiar.Enabled = $false; $btnLuego.Enabled = $false; $btnAct.Enabled = $false; $combo.Enabled = $false
  $f.UseWaitCursor = $true
  $script:proceso = Nodo 'copiar'
  $script:lectura = $script:proceso.StandardOutput.ReadLineAsync()
  $timer.Start()
})

$f.Add_FormClosing({
  param($s, $e)
  if ($script:proceso -ne $null -and -not $script:proceso.HasExited) {
    Escribe 'Espera a que termine la copia: no cierres todavía.'
    $e.Cancel = $true; return
  }
  if ($SiToca -and -not $script:hecho) { NodoYa 'recordar' | Out-Null }
})

function Captura {
  $f.Refresh()
  $bmp = New-Object System.Drawing.Bitmap($f.Width, $f.Height)
  $f.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $f.Width, $f.Height)))
  $bmp.Save($Captura, [System.Drawing.Imaging.ImageFormat]::Png)
  $script:hecho = $true
  $f.Close()
}
if ($Captura -and $PulsaCopiar) {
  $f.Add_Shown({ $btnCopiar.PerformClick() })
  $vigia = New-Object System.Windows.Forms.Timer
  $vigia.Interval = 500
  $vigia.Add_Tick({ if ($script:proceso -ne $null -and $script:lectura -eq $null) { $vigia.Stop(); Captura } })
  $vigia.Start()
} elseif ($Captura) {
  $f.Add_Shown({ Captura })
}
[void]$f.ShowDialog()
$mutex.ReleaseMutex()
