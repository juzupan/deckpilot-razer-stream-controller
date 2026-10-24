# Ayudante que avisa que programa esta en primer plano.
# Imprime el nombre del proceso (sin .exe, en minusculas) cada vez que cambia.
# El Explorador de archivos sale como "explorer"; el escritorio y la barra de tareas como "escritorio".
# Se cierra solo cuando DeckPilot se cierra.

# texto en UTF-8 para que las tildes y la n lleguen bien a DeckPilot
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class RDWin {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    public static string Clase(IntPtr h) { var sb = new StringBuilder(256); GetClassName(h, sb, 256); return sb.ToString(); }
}
"@

$parent = [int]$args[0]
$last = ''
$vuelta = 0
$ultimoPid = 0
$ultimoNombre = ''
while ($true) {
    # revisar si DeckPilot sigue vivo cada ~6 s (no en cada vuelta: ahorra CPU)
    $vuelta++
    if ($parent -and ($vuelta % 20) -eq 0 -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
    $name = ''
    try {
        $h = [RDWin]::GetForegroundWindow()
        $procId = 0
        [void][RDWin]::GetWindowThreadProcessId($h, [ref]$procId)
        # misma ventana de antes: no volvemos a preguntarle a Windows el nombre (ahorra CPU)
        if ($procId -ne 0 -and $procId -eq $ultimoPid) { $name = $ultimoNombre }
        elseif ($procId -ne 0) {
            $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
            if ($name) { $name = $name.ToLower() }
            $ultimoPid = $procId; $ultimoNombre = $name
        }
        if ($name -eq 'explorer' -and [RDWin]::Clase($h) -ne 'CabinetWClass') { $name = 'escritorio' }
    } catch { }
    if ($name -and $name -ne $last) {
        try {
            [Console]::Out.WriteLine($name)
            [Console]::Out.Flush()
        } catch { exit }
        $last = $name
    }
    Start-Sleep -Milliseconds 300
}
