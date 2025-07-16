-- simulate_blocking.sql

-- สคริปต์นี้จะจำลองสถานการณ์ Blocking
-- ต้องรันจาก 2 Session (2 หน้าต่าง Query ใน SSMS) พร้อมกัน

-- **** คำเตือน: รันในฐานข้อมูลทดสอบเท่านั้น ****

-- สร้างตารางทดสอบ (รันใน 1st Session และ 2nd Session ก่อนเริ่มทดสอบ)
USE TestPerformanceDB; -- เปลี่ยน YourTestDatabase
GO

IF OBJECT_ID('dbo.TestBlockingTable', 'U') IS NOT NULL
    DROP TABLE dbo.TestBlockingTable;
GO

CREATE TABLE dbo.TestBlockingTable (
    ID INT PRIMARY KEY,
    Value NVARCHAR(100),
    LastUpdated DATETIME DEFAULT GETDATE()
);
GO

INSERT INTO dbo.TestBlockingTable (ID, Value) VALUES (1, 'Initial Value 1');
INSERT INTO dbo.TestBlockingTable (ID, Value) VALUES (2, 'Initial Value 2');
GO

-- ----------------------------------------------------
-- SESSION 1 (รันโค้ดนี้ในหน้าต่าง Query หนึ่ง)
-- ----------------------------------------------------
-- เริ่ม Transaction และ Lock แถว ID = 1
BEGIN TRAN;
    UPDATE dbo.TestBlockingTable
    SET Value = 'Updated by Session 1', LastUpdated = GETDATE()
    WHERE ID = 1;

    PRINT 'Session 1: Updated ID = 1, holding lock. Waiting 15 seconds...';
    WAITFOR DELAY '00:00:15'; -- Hold lock for 15 seconds

    -- อย่าเพิ่ง COMMIT หรือ ROLLBACK จนกว่าจะเห็นผลการ Blocking
    -- COMMIT TRAN;
    -- ROLLBACK TRAN;
PRINT 'Session 1: Transaction completed.';
GO


-- ----------------------------------------------------
-- SESSION 2 (รันโค้ดนี้ในหน้าต่าง Query ที่สอง)
-- ----------------------------------------------------
-- พยายาม UPDATE แถวเดียวกันที่ถูก Lock โดย Session 1
-- Session นี้จะถูก Block จนกว่า Session 1 จะปล่อย Lock
BEGIN TRAN;
    PRINT 'Session 2: Attempting to update ID = 1, will be blocked...';
    UPDATE dbo.TestBlockingTable
    SET Value = 'Updated by Session 2 - BLOCKED', LastUpdated = GETDATE()
    WHERE ID = 1;

    PRINT 'Session 2: Update completed (was blocked).';
COMMIT TRAN;
GO

-- ----------------------------------------------------
-- หลังการทดสอบ: Clean up (รันใน Session ใดก็ได้)
-- ----------------------------------------------------
-- DROP TABLE dbo.TestBlockingTable;
-- GO