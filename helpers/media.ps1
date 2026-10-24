# Musica para DeckPilot.
#  - "p <izq> <der>"  ~14 veces por segundo: volumen real que sale por los parlantes (0..1)
#  - "m {json}"       cuando cambia la cancion o el estado: titulo, artista, app, sonando, portada (ruta png)
# Usa las APIs de Windows: medidor de audio (Core Audio) y controles multimedia del sistema.

# texto en UTF-8 para que las tildes y la n lleguen bien a DeckPilot
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false

$parent = [int]$args[0]
$dirPortadas = $args[1]

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    [PreserveSig] int NotImpl1();
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}
[ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation {
    [PreserveSig] int GetPeakValue(out float peak);
    [PreserveSig] int GetMeteringChannelCount(out int count);
    [PreserveSig] int GetChannelsPeakValues(int count, [In, Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 0)] float[] peaks);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

public static class RDMeter {
    static IAudioMeterInformation meter;
    public static string Error = null;
    static DateTime ultimo = DateTime.MinValue;
    static void Abrir() {
        var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
        IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
        Guid iid = typeof(IAudioMeterInformation).GUID; object o;
        dev.Activate(ref iid, 23, IntPtr.Zero, out o);
        meter = (IAudioMeterInformation)o;
        ultimo = DateTime.Now;
    }
    public static float[] Leer() {
        try {
            // reabrir cada 10 s por si cambiaste de audifonos a parlantes
            if (meter == null || (DateTime.Now - ultimo).TotalSeconds > 10) Abrir();
            int n; meter.GetMeteringChannelCount(out n);
            if (n < 1) return new float[] { 0, 0 };
            float[] v = new float[n]; meter.GetChannelsPeakValues(n, v);
            return new float[] { v[0], n > 1 ? v[1] : v[0] };
        } catch (Exception e) { meter = null; Error = e.Message; return new float[] { 0, 0 }; }
    }
}
"@

# --- controles multimedia de Windows (WinRT) ---
$smtc = $null
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    function Esperar($op, [Type]$tipo) { $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); [void]$t.Wait(3000); $t.Result }
    [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
    [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
    [void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]
    $smtc = Esperar ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch { [Console]::Out.WriteLine("e sin controles multimedia: $($_.Exception.Message)"); [Console]::Out.Flush() }

function Info-Musica {
    $r = @{ sonando = $false; titulo = ''; artista = ''; app = ''; portada = '' }
    if (-not $smtc) { return $r }
    $s = $smtc.GetCurrentSession()
    if (-not $s) { return $r }
    $r.app = ($s.SourceAppUserModelId -replace '\.exe$', '' -split '[!\\]')[-1]
    $r.sonando = ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing')
    $props = Esperar ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    if ($props) {
        $r.titulo = $props.Title; $r.artista = $props.Artist
        $script:clave = "$($props.Title)|$($props.Artist)"
        if ($props.Thumbnail -and $script:clave -ne $script:clavePortada) {
            try {
                $st = Esperar ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
                $script:nPortada++
                $ruta = Join-Path $dirPortadas ("portada_" + ($script:nPortada % 2) + ".img")
                $fs = [System.IO.File]::Create($ruta); $net.CopyTo($fs); $fs.Close(); $net.Close()
                $script:rutaPortada = $ruta; $script:clavePortada = $script:clave
            } catch { $script:rutaPortada = '' }
        }
        if ($script:clave -eq $script:clavePortada) { $r.portada = $script:rutaPortada }
    }
    return $r
}

$script:nPortada = 0; $script:clavePortada = ''; $script:rutaPortada = ''
$ultimoJson = ''
$avisado = $false
$i = 0
while ($true) {
    if (($i % 15) -eq 0) {
        if ($parent -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
        try {
            $j = (Info-Musica | ConvertTo-Json -Compress)
            $j = [regex]::Replace($j, '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
            if ($j -ne $ultimoJson) { [Console]::Out.WriteLine("m $j"); [Console]::Out.Flush(); $ultimoJson = $j }
        } catch { }
    }
    $v = [RDMeter]::Leer()
    if ([RDMeter]::Error -and -not $avisado) { [Console]::Out.WriteLine("e medidor de audio: " + [RDMeter]::Error); $avisado = $true }
    try {
        [Console]::Out.WriteLine(("p {0:0.000} {1:0.000}" -f $v[0], $v[1]).Replace(',', '.'))
        [Console]::Out.Flush()
    } catch { exit }
    $i++
    Start-Sleep -Milliseconds 70
}
