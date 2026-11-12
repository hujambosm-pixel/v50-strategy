' scripts/copias/restaurarCopia.vbs
'
' Abre la ventana restaurarCopia.ps1 sin consola negra (acceso directo «Restaurar copia»).
' Ver docs/builder.md §133.

Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = carpeta
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & carpeta & "\restaurarCopia.ps1""", 0, False
