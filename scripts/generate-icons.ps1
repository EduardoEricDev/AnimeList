Add-Type -AssemblyName System.Drawing

$sourcePath = 'C:\Users\Dudu\.gemini\antigravity-ide\brain\404c02a6-8861-4b5e-bd53-eaec846db81b\anime_app_icon_1789179086530.jpg'
$assetsDir = 'F:\projetos\Lista animes\assets'
if (!(Test-Path $assetsDir)) { 
    New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null 
}

$pngPath = Join-Path $assetsDir 'icon.png'
$icoPath = Join-Path $assetsDir 'app.ico'
$faviconPath = Join-Path $assetsDir 'favicon.ico'

# 1. Carregar imagem original gerada
$srcImg = [System.Drawing.Image]::FromFile($sourcePath)

# 2. Salvar como PNG 512x512
$bmp512 = New-Object System.Drawing.Bitmap 512, 512
$g512 = [System.Drawing.Graphics]::FromImage($bmp512)
$g512.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g512.DrawImage($srcImg, 0, 0, 512, 512)
$g512.Dispose()
$bmp512.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# 3. Salvar como ICO (256x256)
$bmp256 = New-Object System.Drawing.Bitmap 256, 256
$g256 = [System.Drawing.Graphics]::FromImage($bmp256)
$g256.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g256.DrawImage($srcImg, 0, 0, 256, 256)
$g256.Dispose()

$hIcon = $bmp256.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream $icoPath, ([System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()

# 4. Copiar como favicon.ico
Copy-Item $icoPath $faviconPath -Force

$srcImg.Dispose()
$bmp512.Dispose()
$bmp256.Dispose()

Write-Host "Ícones gerados com sucesso na pasta assets:"
Get-ChildItem $assetsDir | Select-Object Name, Length
