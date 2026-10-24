# Mezclador de volumen por app para DeckPilot (Core Audio de Windows).
# Imprime la lista de apps con sonido (JSON) cuando cambia, y acepta ordenes por la entrada estandar:
#   vol <clave> <0-100>     (clave con encodeURIComponent)     cambia el volumen de esa app (todas sus sesiones). clave "general" = volumen general
#   mute <clave> <0|1>      silencia o no

# texto en UTF-8 para que las tildes y la n lleguen bien a DeckPilot
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false

$parent = [int]$args[0]

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom2 { }

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator2 {
    [PreserveSig] int NotImpl1();
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice2 dev);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice2 {
    [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
    [PreserveSig] int NotImpl1(); [PreserveSig] int NotImpl2();
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
}
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int n);
    [PreserveSig] int GetSession(int i, [MarshalAs(UnmanagedType.IUnknown)] out object s);
}
[ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int NotImpl2(); [PreserveSig] int NotImpl3(); [PreserveSig] int NotImpl4(); [PreserveSig] int NotImpl5(); [PreserveSig] int NotImpl6(); [PreserveSig] int NotImpl7(); [PreserveSig] int NotImpl8(); [PreserveSig] int NotImpl9();
    [PreserveSig] int NotImpl10(); [PreserveSig] int NotImpl11();
    [PreserveSig] int GetProcessId(out uint pid);
    [PreserveSig] int IsSystemSoundsSession();
}
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
    [PreserveSig] int SetMasterVolume(float level, ref Guid ctx);
    [PreserveSig] int GetMasterVolume(out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation2 { [PreserveSig] int GetPeakValue(out float peak); }
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    [PreserveSig] int N0(); [PreserveSig] int N1(); [PreserveSig] int N2(); [PreserveSig] int N3();
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    [PreserveSig] int N5();
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int N7(); [PreserveSig] int N8(); [PreserveSig] int N9(); [PreserveSig] int N10();
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

public class RDApp {
    public string clave; public string nombre; public string ruta; public int vol; public bool mute; public double pico; public bool sistema;
}

public static class RDEntrada {
    public static System.Collections.Concurrent.ConcurrentQueue<string> Cola = new System.Collections.Concurrent.ConcurrentQueue<string>();
    public static volatile bool Cerrada = false;
    public static void Iniciar() {
        var t = new System.Threading.Thread(() => {
            try {
                string l;
                while ((l = Console.In.ReadLine()) != null) Cola.Enqueue(l);
            } catch { }
            Cerrada = true;
        });
        t.IsBackground = true;
        t.Start();
    }
}

public static class RDMix {
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder s, ref int size);

    static Guid ctx = Guid.Empty;
    static Dictionary<string, string> nombres = new Dictionary<string, string>();
    // nombre bonito de la app (descripcion del .exe), guardado para no leer el archivo cada vez
    static string Nombre(string clave, string ruta) {
        string n;
        if (nombres.TryGetValue(clave, out n)) return n;
        n = clave;
        try { if (ruta != "") { var d = System.Diagnostics.FileVersionInfo.GetVersionInfo(ruta).FileDescription; if (!String.IsNullOrEmpty(d) && d.Length < 30) n = d; } } catch { }
        nombres[clave] = n;
        return n;
    }
    static Dictionary<uint, string> rutas = new Dictionary<uint, string>();

    static IMMDevice2 Dispositivo() {
        var en = (IMMDeviceEnumerator2)(new MMDeviceEnumeratorCom2());
        IMMDevice2 dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
        return dev;
    }
    static IAudioEndpointVolume General() {
        Guid iid = typeof(IAudioEndpointVolume).GUID; object o;
        Dispositivo().Activate(ref iid, 23, IntPtr.Zero, out o);
        return (IAudioEndpointVolume)o;
    }
    static string Ruta(uint pid) {
        string r;
        if (rutas.TryGetValue(pid, out r)) return r;
        r = "";
        IntPtr h = OpenProcess(0x1000, false, pid);
        if (h != IntPtr.Zero) {
            var sb = new StringBuilder(1024); int n = sb.Capacity;
            if (QueryFullProcessImageName(h, 0, sb, ref n)) r = sb.ToString();
            CloseHandle(h);
        }
        rutas[pid] = r;
        return r;
    }

    // todas las sesiones de audio vivas: (proceso, volumen, medidor)
    static List<Tuple<string, string, ISimpleAudioVolume, IAudioMeterInformation2, bool>> Sesiones() {
        var res = new List<Tuple<string, string, ISimpleAudioVolume, IAudioMeterInformation2, bool>>();
        Guid iid = typeof(IAudioSessionManager2).GUID; object o;
        Dispositivo().Activate(ref iid, 23, IntPtr.Zero, out o);
        var mgr = (IAudioSessionManager2)o;
        IAudioSessionEnumerator en; mgr.GetSessionEnumerator(out en);
        int n; en.GetCount(out n);
        for (int i = 0; i < n; i++) {
            object s; en.GetSession(i, out s);
            var c2 = (IAudioSessionControl2)s;
            int st; c2.GetState(out st);
            if (st == 2) continue; // expirada
            uint pid; c2.GetProcessId(out pid);
            bool sistema = c2.IsSystemSoundsSession() == 0;
            string ruta = sistema ? "" : Ruta(pid);
            string clave = sistema ? "sistema" : System.IO.Path.GetFileNameWithoutExtension(ruta).ToLower();
            if (clave == "") continue;
            res.Add(Tuple.Create(clave, ruta, (ISimpleAudioVolume)s, (IAudioMeterInformation2)s, sistema));
        }
        return res;
    }

    public static List<RDApp> Listar() {
        var porClave = new Dictionary<string, RDApp>();
        var orden = new List<RDApp>();
        foreach (var t in Sesiones()) {
            RDApp a;
            if (!porClave.TryGetValue(t.Item1, out a)) {
                a = new RDApp(); a.clave = t.Item1; a.ruta = t.Item2; a.sistema = t.Item5;
                float v; t.Item3.GetMasterVolume(out v); a.vol = (int)Math.Round(v * 100);
                bool m; t.Item3.GetMute(out m); a.mute = m;
                a.nombre = a.sistema ? "Sistema" : Nombre(a.clave, a.ruta);
                porClave[t.Item1] = a; orden.Add(a);
            }
            float p; t.Item4.GetPeakValue(out p);
            if (p > a.pico) a.pico = p;
        }
        var g = new RDApp(); g.clave = "general"; g.nombre = "General"; g.ruta = "";
        try { var ev = General(); float v; ev.GetMasterVolumeLevelScalar(out v); g.vol = (int)Math.Round(v * 100); bool m; ev.GetMute(out m); g.mute = m; } catch { }
        orden.Insert(0, g);
        return orden;
    }

    public static void Volumen(string clave, int vol) {
        float f = Math.Max(0, Math.Min(100, vol)) / 100f;
        if (clave == "general") { General().SetMasterVolumeLevelScalar(f, ref ctx); return; }
        foreach (var t in Sesiones()) if (t.Item1 == clave) t.Item3.SetMasterVolume(f, ref ctx);
    }
    public static void Silencio(string clave, bool m) {
        if (clave == "general") { General().SetMute(m, ref ctx); return; }
        foreach (var t in Sesiones()) if (t.Item1 == clave) t.Item3.SetMute(m, ref ctx);
    }
}
"@

function Json-Lista {
    $l = [RDMix]::Listar() | ForEach-Object { [ordered]@{ clave = $_.clave; nombre = $_.nombre; ruta = $_.ruta; vol = $_.vol; mute = $_.mute; activo = ($_.pico -gt 0.001) } }
    $j = ConvertTo-Json @($l) -Compress
    # solo ASCII (las tildes viajan como \u00e9) para que nunca se rompan
    return [regex]::Replace($j, '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
}

[RDEntrada]::Iniciar()
$ultimo = ''
$i = 99
while ($true) {
    if ([RDEntrada]::Cerrada) { exit }
    $linea = $null
    while ([RDEntrada]::Cola.TryDequeue([ref]$linea)) {
        $p = $linea.Trim() -split ' '
        try {
            $clave = [Uri]::UnescapeDataString($p[1])
            if ($p[0] -eq 'vol') { [RDMix]::Volumen($clave, [int]$p[2]) }
            elseif ($p[0] -eq 'mute') { [RDMix]::Silencio($clave, $p[2] -eq '1') }
        } catch { [Console]::Out.WriteLine("e $($_.Exception.Message)"); [Console]::Out.Flush() }
        $i = 99 # refrescar ya
    }
    if ($i -ge 5) {
        if ($parent -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
        try {
            $j = Json-Lista
            if ($j -ne $ultimo) { [Console]::Out.WriteLine("l $j"); [Console]::Out.Flush(); $ultimo = $j }
        } catch { [Console]::Out.WriteLine("e $($_.Exception.Message)"); [Console]::Out.Flush() }
        $i = 0
    }
    $i++
    Start-Sleep -Milliseconds 100
}
