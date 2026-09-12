' ==============================================================================
' AnimeList - Silent VBS Launcher
' Inicia o launcher PowerShell de forma 100% silenciosa (sem tela preta de CMD)
' ==============================================================================

Dim objShell, objFSO, strAppPath, strPSCommand
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

strAppPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
strPSCommand = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & strAppPath & "\scripts\launcher.ps1"""

objShell.Run strPSCommand, 0, False
