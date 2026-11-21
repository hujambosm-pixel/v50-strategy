' scripts/alertas/comprobador.vbs
'
' Lanza comprobador.js SIN VENTANA (la tarea programada llama a wscript.exe con este archivo; si lanzara
' node.exe directamente, saldria una consola negra un instante cada 15 minutos). Ver docs/builder.md §217.

Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = carpeta
' 0 = ventana oculta; True = espera a que termine.
codigo = sh.Run("node """ & carpeta & "\comprobador.js""", 0, True)
WScript.Quit codigo
