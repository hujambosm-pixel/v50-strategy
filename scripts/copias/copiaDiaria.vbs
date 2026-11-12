' scripts/copias/copiaDiaria.vbs
'
' Lanza copiaDiaria.js SIN VENTANA (la tarea programada llama a wscript.exe con este archivo) y,
' después, el aviso del USB si toca (cada 15 días). Una tarea que lanza node.exe directamente abre
' una consola negra un instante cada hora. Ver docs/builder.md §130 y §131.

Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = carpeta
' 0 = ventana oculta; True = espera a que termine.
codigo = sh.Run("node """ & carpeta & "\copiaDiaria.js""", 0, True)
' El aviso no se espera: si se queda abierto, la tarea de la hora siguiente no lo duplica.
sh.Run "wscript.exe """ & carpeta & "\avisoUsb.vbs"" /sitoca", 0, False
WScript.Quit codigo
