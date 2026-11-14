' scripts/lanzador/lanzador.vbs
'
' Abre la ventana del lanzador (ventana.ps1) sin consola negra. Ver docs/builder.md §134.
'   wscript lanzador.vbs arrancar   |   wscript lanzador.vbs parar   |   wscript lanzador.vbs parar-app

Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = carpeta
accion = "arrancar"
If WScript.Arguments.Count > 0 Then accion = LCase(WScript.Arguments(0))
If accion <> "parar" And accion <> "parar-app" Then accion = "arrancar"
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & carpeta & "\ventana.ps1"" -Accion " & accion, 0, False
