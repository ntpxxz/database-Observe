-- simulate_slow_query.sql

-- แนะนำ: รันในฐานข้อมูลทดสอบเท่านั้น และตรวจสอบให้แน่ใจว่าคุณมีสิทธิ์
USE TestPerformanceDB; -- เปลี่ยน YourTestDatabase เป็นชื่อฐานข้อมูลที่คุณต้องการทดสอบ

PRINT 'Starting a simulated slow query...';
PRINT 'This query will wait for 10 seconds and then perform a simple count.';

-- จำลองการทำงานที่ล่าช้าด้วย WAITFOR DELAY
WAITFOR DELAY '00:00:10'; -- หน่วงเวลา 10 วินาที

-- จำลองการทำงานที่อาจใช้ CPU/Disk โดยการนับข้อมูลจากตารางขนาดใหญ่
-- (ถ้าไม่มีตารางใหญ่ ให้สร้างตารางทดสอบ หรือใช้ตารางที่มีอยู่)
-- ตัวอย่าง: SELECT COUNT(*) FROM sys.objects; -- sys.objects เป็นตารางระบบที่มักจะมีอยู่ในทุกฐานข้อมูล
SELECT COUNT(*)
FROM sys.objects; -- หรือเปลี่ยนเป็นตารางอื่นที่มีข้อมูลเยอะๆ เช่น YourLargeDataTable

PRINT 'Simulated slow query finished.';

-- คุณสามารถเพิ่ม Query อื่นๆ ที่ต้องการทดสอบการทำงานช้าได้ที่นี่
-- ตัวอย่าง:
-- SELECT * FROM YourAnotherLargeTable WHERE SomeColumn LIKE '%test%';
-- GO