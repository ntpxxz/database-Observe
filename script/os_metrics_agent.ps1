# ===================================================================
# PowerShell Real-time OS Metrics Agent v2 (with Disk Metrics)
# Author: Gemini
# Description: A simple HTTP server to expose OS metrics (CPU, Memory, Disk)
# for monitoring dashboards. No external dependencies needed.
# ===================================================================

# --- การตั้งค่า Web Server ---
$port = 5002
$prefix = "http://+:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

# --- ฟังก์ชันสำหรับดึงข้อมูล Hardware ทั้งหมด ---
function Get-HardwareMetrics {
    # 1. ดึงข้อมูล CPU Usage (เหมือนเดิม)
    $cpuSample = (Get-Counter -Counter "\Processor(_Total)\% Processor Time" -SampleInterval 1 -MaxSamples 2).CounterSamples[1]
    $cpuUsage = [math]::Round($cpuSample.CookedValue, 2)

    # 2. ดึงข้อมูล Memory (เหมือนเดิม)
    $memoryInfo = Get-CimInstance -ClassName win32_operatingsystem
    $totalMemoryGB = [math]::Round($memoryInfo.TotalVisibleMemorySize / 1024 / 1024, 2)
    $freeMemoryGB = [math]::Round($memoryInfo.FreePhysicalMemory / 1024 / 1024, 2)
    $usedMemoryGB = $totalMemoryGB - $freeMemoryGB
    $memoryUsagePercent = [math]::Round(($usedMemoryGB / $totalMemoryGB) * 100, 2)

    # --- [เพิ่มใหม่] ส่วนดึงข้อมูล Harddisk ---
    
    # 3.1 ดึงข้อมูลพื้นที่ของแต่ละไดรฟ์
    $driveInfo = Get-PSDrive -PSProvider 'FileSystem' | ForEach-Object {
        $totalSizeGB = [math]::Round($_.Used + $_.Free, 2)
        $usedGB = [math]::Round($_.Used, 2)
        # ป้องกันการหารด้วยศูนย์ถ้าเป็นไดรฟ์ที่ไม่มีขนาด
        if ($totalSizeGB -gt 0) {
            $usagePercentage = [math]::Round(($usedGB / $totalSizeGB) * 100, 2)
        } else {
            $usagePercentage = 0
        }

        [PSCustomObject]@{
            Drive           = $_.Name
            TotalSizeGB     = $totalSizeGB
            UsedSpaceGB     = $usedGB
            FreeSpaceGB     = [math]::Round($_.Free, 2)
            UsagePercentage = $usagePercentage
        }
    }

    # 3.2 ดึงข้อมูลกิจกรรม (I/O) ของดิสก์ทั้งหมดรวมกัน
    # เราจะใช้ Get-Counter เพื่อวัดค่าเฉลี่ยใน 1 วินาที
    $diskCounters = @(
        "\PhysicalDisk(_Total)\% Disk Time",
        "\PhysicalDisk(_Total)\Disk Read Bytes/sec",
        "\PhysicalDisk(_Total)\Disk Write Bytes/sec"
    )
    $diskSamples = (Get-Counter -Counter $diskCounters -SampleInterval 1 -MaxSamples 2).CounterSamples
    
    $diskActivity = [PSCustomObject]@{
        # % Disk Time คือเปอร์เซ็นต์เวลาที่ดิสก์ "ไม่ว่าง"
        PercentDiskTime = [math]::Round(($diskSamples | Where-Object {$_.Path -like "*\% disk time"}).CookedValue, 2)
        # ความเร็วในการอ่านข้อมูล (แปลงจาก Byte/s เป็น MB/s)
        ReadSpeedMBps   = [math]::Round(($diskSamples | Where-Object {$_.Path -like "*\disk read bytes/sec"}).CookedValue / 1MB, 2)
        # ความเร็วในการเขียนข้อมูล (แปลงจาก Byte/s เป็น MB/s)
        WriteSpeedMBps  = [math]::Round(($diskSamples | Where-Object {$_.Path -like "*\disk write bytes/sec"}).CookedValue / 1MB, 2)
    }

    # 4. สร้าง Object ผลลัพธ์สุดท้ายที่รวมทุกอย่าง
    $metrics = [PSCustomObject]@{
        cpu = @{
            usage_percent = $cpuUsage
        }
        memory = @{
            total_gb      = $totalMemoryGB
            used_gb       = [math]::Round($usedMemoryGB, 2)
            usage_percent = $memoryUsagePercent
        }
        # เพิ่ม Key ใหม่สำหรับข้อมูล Disk
        disk = @{
            drives   = $driveInfo    # Array ของข้อมูลพื้นที่แต่ละไดรฟ์
            activity = $diskActivity # Object ของข้อมูลกิจกรรม
        }
    }
    
    return $metrics
}


# --- ส่วนหลัก: Loop การทำงานของ Web Server (เหมือนเดิม) ---
try {
    Write-Host "Starting OS Metrics Agent v2 on port $port..."
    $listener.Start()
    Write-Host "Agent started. Listening for requests at $($prefix)metrics"

    while ($listener.IsListening) {
        # ... โค้ดส่วนที่เหลือเหมือนเดิมทั้งหมด ไม่ต้องแก้ไข ...
        $context = $listener.GetContext()
        # ...
        try {
            if ($request.Url.AbsolutePath -eq "/metrics" -and $request.HttpMethod -eq "GET") {
                $data = Get-HardwareMetrics
                $jsonResponse = $data | ConvertTo-Json -Depth 5 # เพิ่ม -Depth 5 เพื่อให้แปลง JSON ที่ซ้อนกันได้ครบ
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
                $response.StatusCode = 200
                $response.ContentType = "application/json"
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            } else {
                $response.StatusCode = 404
                # ...
            }
        }
        catch { #... 
        }
        finally {
            $response.Close()
        }
    }
}
catch { #...
}
finally {
    if ($listener.IsListening) {
        Write-Host "Stopping OS Metrics Agent..."
        $listener.Stop()
    }
}