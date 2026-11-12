' scripts/copias/copiaDiaria.vbs
'
' Lanza copiaDiaria.js SIN VENTANA (la tarea programada llama a wscript.exe con este archivo).
' Una tarea que lanza node.exe directamente abre una consola negra un instante cada hora.
' Ver docs/builder.md §130.

Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = carpeta
' 0 = ventana oculta; True = espera a que termine (la tarea sabe cuándo acabó).
codigo = sh.Run("node """ & carpeta & "\copiaDiaria.js""", 0, True)
WScript.Quit codigo
