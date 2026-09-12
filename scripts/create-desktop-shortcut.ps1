# ==============================================================================
# AnimeList - Criador de Atalho na Area de Trabalho com Icone Customizado
# ==============================================================================

$projectDir = Split-Path -Parent $PSScriptRoot
$vbsPath = Join-Path $projectDir "launch-app.vbs"
$icoPath = Join-Path $projectDir "assets\app.ico"
$wscriptExe = "C:\Windows\System32\wscript.exe"

$WshShell = New-Object -ComObject WScript.Shell

# Obter Area de Trabalho do Usuario
$desktopDirs = @(
    [System.Environment]::GetFolderPath('Desktop'),
    "F:\OneDrive\Área de Trabalho",
    "$env:USERPROFILE\Desktop"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$createdShortcuts = @()

foreach ($desktopPath in $desktopDirs) {
    $shortcutPath = Join-Path $desktopPath "AnimeList.lnk"
    
    # Remover atalho antigo se existir para forcar atualizacao do icone
    if (Test-Path $shortcutPath) {
        Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
    }

    $Shortcut = $WshShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = $wscriptExe
    $Shortcut.Arguments = "`"$vbsPath`""
    $Shortcut.WorkingDirectory = $projectDir
    $Shortcut.IconLocation = "$icoPath, 0"
    $Shortcut.Description = "AnimeList - Rastreador e Catalogo Pessoal de Animes"
    $Shortcut.Save()

    $createdShortcuts += $shortcutPath
}

# Criar tambem um atalho dentro da propria pasta do projeto para conveniencia
$folderShortcut = Join-Path $projectDir "AnimeList.lnk"
if (Test-Path $folderShortcut) {
    Remove-Item $folderShortcut -Force -ErrorAction SilentlyContinue
}
$Shortcut = $WshShell.CreateShortcut($folderShortcut)
$Shortcut.TargetPath = $wscriptExe
$Shortcut.Arguments = "`"$vbsPath`""
$Shortcut.WorkingDirectory = $projectDir
$Shortcut.IconLocation = "$icoPath, 0"
$Shortcut.Description = "AnimeList - Rastreador e Catalogo Pessoal de Animes"
$Shortcut.Save()
$createdShortcuts += $folderShortcut

# Notificar o Windows Explorer para recarregar o cache de icones da Area de Trabalho imediatamente
try {
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class ShellNotifier {
        [DllImport("shell32.dll")]
        public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
    }
"@
    [ShellNotifier]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
} catch {
    # Ignora caso nao seja possivel carregar o tipo
}

Write-Host "Atalhos atualizados com sucesso:"
foreach ($sc in $createdShortcuts) {
    Write-Host " - $sc"
}
