# Saca el icono real de cada programa (256x256 con transparencia) y lo guarda como PNG.
# Uso: iconos.ps1 <lista.json>   donde la lista es [{ "ruta": "...exe|.url|.ico", "salida": "...png" }]

# texto en UTF-8 para que las tildes y la n lleguen bien a DeckPilot
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class RDIcon {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern uint PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] icons, uint[] ids, uint n, uint flags);
    [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);
}
"@

$lista = Get-Content -Raw -Encoding UTF8 $args[0] | ConvertFrom-Json
foreach ($item in $lista) {
    try {
        $ruta = [Environment]::ExpandEnvironmentVariables($item.ruta)
        $indice = 0
        if ($ruta.ToLower().EndsWith('.url') -and (Test-Path $ruta)) {
            # accesos directos de Steam: el icono esta en IconFile=
            foreach ($l in Get-Content $ruta) {
                if ($l -match '^IconFile=(.+)$') { $ruta = $Matches[1].Trim() }
                if ($l -match '^IconIndex=(-?\d+)') { $indice = [int]$Matches[1] }
            }
        }
        if (-not (Test-Path $ruta)) { Write-Output "sin icono: $($item.ruta)"; continue }
        $h = New-Object IntPtr[] 1
        $ids = New-Object uint32[] 1
        $n = [RDIcon]::PrivateExtractIcons($ruta, $indice, 256, 256, $h, $ids, 1, 0)
        if ($n -lt 1 -or $h[0] -eq [IntPtr]::Zero) {
            # respaldo: el icono que muestra el Explorador (mas chico, pero algo es algo)
            $assoc = [System.Drawing.Icon]::ExtractAssociatedIcon($ruta)
            if (-not $assoc) { Write-Output "sin icono: $ruta"; continue }
            $bmp = New-Object System.Drawing.Bitmap 128, 128
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.DrawImage($assoc.ToBitmap(), 0, 0, 128, 128); $g.Dispose()
            $bmp.Save($item.salida, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
            Write-Output "ok: $ruta (respaldo)"
            continue
        }
        $icon = [System.Drawing.Icon]::FromHandle($h[0])
        $bmp = $icon.ToBitmap()
        $bmp.Save($item.salida, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose(); $icon.Dispose(); [void][RDIcon]::DestroyIcon($h[0])
        Write-Output "ok: $ruta"
    } catch {
        Write-Output "error: $($item.ruta) $($_.Exception.Message)"
    }
}
