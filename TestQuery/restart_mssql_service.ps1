# restart_mssql_service.ps1

# สคริปต์นี้จะหยุดและเริ่ม Service ของ SQL Server ใหม่
# รันด้วยสิทธิ์ Administrator (Run as Administrator)

# **** คำเตือน: การรันสคริปต์นี้จะทำให้ SQL Server ไม่สามารถใช้งานได้ชั่วคราว ****
# **** โปรดรันในสภาพแวดล้อม Development/Staging เท่านั้น ****

# กำหนดชื่อ Service ของ SQL Server
# สำหรับ Default Instance: 'MSSQLSERVER'
# สำหรับ Named Instance: 'SQL Server (YourInstanceName)' (แทนที่ YourInstanceName ด้วยชื่อ instance ของคุณ)
$serviceName = 'MSSQLSERVER' # หรือเปลี่ยนเป็น 'SQL Server (SQLEXPRESS)' ถ้าใช้ Express edition

Write-Host "Attempting to restart SQL Server Service: $serviceName" -ForegroundColor Yellow

# ตรวจสอบว่า Service มีอยู่จริง
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
    Write-Host "Service '$serviceName' found."

    # หยุด Service
    Write-Host "Stopping service '$serviceName'..." -ForegroundColor Green
    try {
        Stop-Service -Name $serviceName -Force -ErrorAction Stop
        Write-Host "Service '$serviceName' stopped successfully." -ForegroundColor Green
        Start-Sleep -Seconds 5 # รอ 5 วินาที เพื่อจำลองช่วงเวลาที่ Service หยุดทำงาน
    }
    catch {
        Write-Host "Error stopping service: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }

    # เริ่ม Service
    Write-Host "Starting service '$serviceName'..." -ForegroundColor Green
    try {
        Start-Service -Name $serviceName -ErrorAction Stop
        Write-Host "Service '$serviceName' started successfully." -ForegroundColor Green
    }
    catch {
        Write-Host "Error starting service: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host "Service '$serviceName' not found. Please check the service name." -ForegroundColor Red
    exit 1
}

Write-Host "SQL Server Service restart process completed." -ForegroundColor Cyan