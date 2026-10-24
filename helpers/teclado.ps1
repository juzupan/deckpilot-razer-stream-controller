# Ayudante de teclado para RazerDeck.
# Lee ordenes por la entrada estandar, una por linea:
#   press <ms> <vk,vk,...>   presiona las teclas, las mantiene <ms> y las suelta
#   down <vk,vk,...>          presiona y deja presionadas
#   up <vk,vk,...>            suelta
#   sound <ruta.wav>          reproduce un sonido
#   type <base64 utf8>        escribe un texto (\n = Enter)
# Las teclas normales se mandan por "scancode", que es lo que leen los juegos (DirectInput).
# Las teclas multimedia (volumen, play) se mandan por codigo virtual.

# texto en UTF-8 para que las tildes y la n lleguen bien a DeckPilot
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class RDKeys {
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)]
    struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public INPUTUNION u; }

    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);

    const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_SCANCODE = 0x0008;

    static bool IsExtended(int vk) {
        // flechas, Insert, Supr, Inicio, Fin, RePag, AvPag, Ctrl/Alt derechos, / del teclado numerico
        return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0xA3 || vk == 0xA5 || vk == 0x6F || vk == 0x5B || vk == 0x5C;
    }
    static bool IsMedia(int vk) { return vk >= 0xAD && vk <= 0xB7; }
    // teclado numerico: por scancode Windows lo confunde con Insert/Fin/flechas si Bloq Num esta apagado
    static bool IsNumpad(int vk) { return vk >= 0x60 && vk <= 0x6F; }

    static void Send(int vk, bool up) {
        INPUT[] inp = new INPUT[1];
        inp[0].type = 1;
        if (vk >= 0x10000) {
            // posicion fisica directa ("SC:35"); E0xx = tecla extendida
            int sc = vk & 0xFFFF;
            inp[0].u.ki.wVk = 0;
            inp[0].u.ki.wScan = (ushort)(sc & 0xFF);
            uint fs = KEYEVENTF_SCANCODE;
            if ((sc & 0xFF00) == 0xE000) fs |= KEYEVENTF_EXTENDEDKEY;
            if (up) fs |= KEYEVENTF_KEYUP;
            inp[0].u.ki.dwFlags = fs;
        } else if (IsMedia(vk) || IsNumpad(vk) || vk == 0x2C) {
            inp[0].u.ki.wVk = (ushort)vk;
            inp[0].u.ki.wScan = (ushort)MapVirtualKey((uint)vk, 0);
            inp[0].u.ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
        } else {
            uint sc = MapVirtualKey((uint)vk, 0);
            inp[0].u.ki.wVk = 0;
            inp[0].u.ki.wScan = (ushort)sc;
            uint f = KEYEVENTF_SCANCODE;
            if (IsExtended(vk)) f |= KEYEVENTF_EXTENDEDKEY;
            if (up) f |= KEYEVENTF_KEYUP;
            inp[0].u.ki.dwFlags = f;
        }
        SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void Down(int[] vks) { foreach (int v in vks) { Send(v, false); Thread.Sleep(10); } }
    public static void Up(int[] vks) { for (int i = vks.Length - 1; i >= 0; i--) { Send(vks[i], true); Thread.Sleep(10); } }
    public static void Press(int[] vks, int holdMs) { Down(vks); Thread.Sleep(holdMs); Up(vks); }

    const uint KEYEVENTF_UNICODE = 0x0004;
    public static void TypeText(string text) {
        foreach (char ch in text) {
            if (ch == '\r') continue;
            if (ch == '\n') { Press(new int[] { 0x0D }, 30); continue; }
            INPUT[] inp = new INPUT[2];
            inp[0].type = 1; inp[0].u.ki.wScan = ch; inp[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
            inp[1].type = 1; inp[1].u.ki.wScan = ch; inp[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(5);
        }
    }
}
"@

function Parse-Vks([string]$s) { ,([int[]]($s.Split(',') | Where-Object { $_ -ne '' } | ForEach-Object { [int]$_ })) }

[Console]::Out.WriteLine('listo')
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $line = $line.Trim()
    if ($line -eq '') { continue }
    $parts = $line -split ' ', 3
    try {
        switch ($parts[0]) {
            'press' { [RDKeys]::Press((Parse-Vks $parts[2]), [int]$parts[1]) }
            'down'  { [RDKeys]::Down((Parse-Vks $parts[1])) }
            'up'    { [RDKeys]::Up((Parse-Vks $parts[1])) }
            'type'  { [RDKeys]::TypeText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[1]))) }
            'sound' {
                $path = [Environment]::ExpandEnvironmentVariables($line.Substring(6))
                $p = New-Object System.Media.SoundPlayer $path
                $p.Play()
            }
        }
    } catch {
        [Console]::Out.WriteLine("error $($_.Exception.Message)")
        [Console]::Out.Flush()
    }
}
