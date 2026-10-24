# Monitor de rendimiento para DeckPilot. Imprime una linea JSON por segundo:
# cpu, gpu, gpuTemp, gpuMemUsado, gpuMemTotal (MB), ram (%), ramUsado/ramTotal (GB), disco (% actividad), cLibre (GB)
# Usa contadores de Windows (no dependen del idioma) y nvidia-smi si esta disponible.

# texto en UTF-8 para que las tildes y la n lleguen bien a DeckPilot
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false

$parent = [int]$args[0]
$nucleos = $null
try { $nucleos = (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).NumberOfLogicalProcessors } catch { }

$smi = @("$env:SystemRoot\System32\nvidia-smi.exe", "$env:ProgramFiles\NVIDIA Corporation\NVSMI\nvidia-smi.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1

while ($true) {
    if ($parent -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
    $d = @{}
    try {
        $p = Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'" -ErrorAction Stop
        $d.cpu = [math]::Min(100, [double]$p.PercentProcessorUtility)
    } catch {
        try { $d.cpu = [double](Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime } catch { }
    }
    $d.cpuNucleos = $nucleos
    try {
        $os = Get-CimInstance Win32_OperatingSystem
        $tot = [double]$os.TotalVisibleMemorySize / 1MB
        $lib = [double]$os.FreePhysicalMemory / 1MB
        $d.ramTotal = [math]::Round($tot, 1)
        $d.ramUsado = [math]::Round($tot - $lib, 1)
        $d.ram = [math]::Round(100 * ($tot - $lib) / $tot, 1)
    } catch { }
    try {
        $dk = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'"
        $d.disco = [math]::Max(0, [math]::Min(100, 100 - [double]$dk.PercentIdleTime))
        $c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        $d.cLibre = [math]::Round([double]$c.FreeSpace / 1GB, 0)
    } catch { }
    $gpuOk = $false
    if ($smi) {
        try {
            $l = (& $smi --query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits | Select-Object -First 1) -split ','
            if ($l.Count -ge 4) {
                $d.gpu = [double]$l[0].Trim(); $d.gpuTemp = [double]$l[1].Trim()
                $d.gpuMemUsado = [double]$l[2].Trim(); $d.gpuMemTotal = [double]$l[3].Trim()
                $gpuOk = $true
            }
        } catch { }
    }
    if (-not $gpuOk) {
        try {
            $eng = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object { $_.Name -like '*engtype_3D' }
            $d.gpu = [math]::Min(100, ($eng | Measure-Object -Property UtilizationPercentage -Sum).Sum)
        } catch { }
    }
    try {
        [Console]::Out.WriteLine(($d | ConvertTo-Json -Compress))
        [Console]::Out.Flush()
    } catch { exit }
    Start-Sleep -Milliseconds 900
}
