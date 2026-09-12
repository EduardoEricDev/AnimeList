# ==============================================================================
# AnimeList - Desktop App Launcher
# Inicia o servidor local Node em segundo plano e abre a janela standalone
# ==============================================================================

$projectDir = Split-Path -Parent $PSScriptRoot
$port = 3000
$targetUrl = "http://localhost:$port"

# 1. Função para verificar se a porta está respondendo
function Test-PortActive {
    param([int]$p)
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $connect = $tcp.BeginConnect("127.0.0.1", $p, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(300, $false)
        if ($wait) {
            $tcp.EndConnect($connect)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
        return $false
    } catch {
        return $false
    }
}

# 2. Se o servidor não estiver rodando, inicia em segundo plano
if (!(Test-PortActive -p $port)) {
    $serverScript = Join-Path $projectDir "scripts\server.js"
    if (Test-Path $serverScript) {
        Start-Process -FilePath "node" -ArgumentList "`"$serverScript`"" -WorkingDirectory $projectDir -WindowStyle Hidden
    } else {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx serve -l $port -s ." -WorkingDirectory $projectDir -WindowStyle Hidden
    }

    # Aguardar até 2 segundos para o servidor responder
    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Milliseconds 200
        if (Test-PortActive -p $port) { break }
    }
}

# 3. Detectar executável do navegador (Chrome ou Edge)
$browserExe = $null

$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$edgePaths = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)

foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $browserExe = $path
        break
    }
}

if (-not $browserExe) {
    foreach ($path in $edgePaths) {
        if (Test-Path $path) {
            $browserExe = $path
            break
        }
    }
}

# 4. Abrir em modo aplicativo dedicado (App Mode)
if ($browserExe) {
    Start-Process -FilePath $browserExe -ArgumentList "--app=$targetUrl", "--window-size=1200,800"
} else {
    # Fallback para o navegador padrão do sistema
    Start-Process $targetUrl
}
