# --- ตั้งค่าการเชื่อมต่อ ---
$serverInstance = "PC23" # ชื่อ Server ของคุณ
$database = "TestPerformanceDB"
$connectionString = "Server=$serverInstance;Database=$database;Integrated Security=True;"

# --- Query ที่จะใช้ทดสอบ ---
$query = @"
SELECT TOP 100 * FROM Products WHERE CategoryID = (ABS(CHECKSUM(NEWID())) % 20 + 1);
"@

# --- Loop ไม่รู้จบ ---
Write-Host "Starting continuous query... Press Ctrl+C to stop." -ForegroundColor Green
while ($true) {
    try {
        $connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
        $command = New-Object System.Data.SqlClient.SqlCommand($query, $connection)
        $connection.Open()

        Write-Host "Executing query at $(Get-Date -Format 'HH:mm:ss')..."
        $command.ExecuteNonQuery() # หรือใช้ ExecuteReader() ถ้าต้องการผลลัพธ์
        $command.ExecuteReader()
        $connection.Close()
    }
    catch {
        Write-Host "An error occurred: $($_.Exception.Message)" -ForegroundColor Red
    }

    # หน่วงเวลา 2 วินาที
    Start-Sleep -Seconds 2
}