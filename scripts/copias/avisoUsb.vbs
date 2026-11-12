' scripts/copias/avisoUsb.vbs
'
' Abre la ventana avisoUsb.ps1 sin consola negra. Ver docs/builder.md §131.
'   wscript avisoUsb.vbs           la abre siempre (acceso directo «Copiar al USB ahora»)
'   wscript avisoUsb.vbs /sitoca   solo si toca (lo usa copiaDiaria.vbs cada hora)

Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = carpeta
extra = ""
If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments(0)) = "/sitoca" Then extra = " -SiToca"
End If
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & carpeta & "\avisoUsb.ps1""" & extra, 0, False
