# ==============================================================================
# AnimeList - Criador de Atalho na Área de Trabalho com Ícone Customizado
# ==============================================================================

$projectDir = Split-Path -Parent $PSScriptRoot
$vbsPath = Join-Path $projectDir "launch-app.vbs"
$icoPath = Join-Path $projectDir "assets\app.ico"
$wscriptExe = "C:\Windows\System32\wscript.exe"

$WshShell = New-Object -ComObject WScript.Shell

# Obter Área de Trabalho do Usuário
$desktopDirs = @(
    [System.Environment]::GetFolderPath('Desktop'),
    "F:\OneDrive\Área de Trabalho",
    "$env:USERPROFILE\Desktop"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$createdShortcuts = @()

foreach ($desktopPath in $desktopDirs) {
    $shortcutPath = Join-Path $desktopPath "AnimeList.lnk"
    
    $Shortcut = $WshShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = $wscriptExe
    $Shortcut.Arguments = "`"$vbsPath`""
    $Shortcut.WorkingDirectory = $projectDir
    $Shortcut.IconLocation = "$icoPath, 0"
    $Shortcut.Description = "AnimeList • Rastreador e Catálogo Pessoal de Animes"
    $Shortcut.Save()

    $createdShortcuts += $shortcutPath
}

# Criar também um atalho dentro da própria pasta do projeto para conveniência
$folderShortcut = Join-Path $projectDir "AnimeList.lnk"
$Shortcut = $WshShell.CreateShortcut($folderShortcut)
$Shortcut.TargetPath = $wscriptExe
$Shortcut.Arguments = "`"$vbsPath`""
$Shortcut.WorkingDirectory = $projectDir
$Shortcut.IconLocation = "$icoPath, 0"
$Shortcut.Description = "AnimeList • Rastreador e Catálogo Pessoal de Animes"
$Shortcut.Save()
$createdShortcuts += $folderShortcut

Write-Host "Atalhos criados com sucesso:"
foreach ($sc in $createdShortcuts) {
    Write-Host " - $sc"
}
