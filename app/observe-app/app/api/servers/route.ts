import { NextResponse } from 'next/server';
import { queryAppDb, sql, getConnection } from '@/lib/db';
import { DatabaseInventoryFormData } from '@/types';

export async function GET() {
    try {
        const result = await queryAppDb('SELECT * FROM servers ORDER BY systemName ASC');
        return NextResponse.json({ data: result.recordset });
    } catch (error: any) {
        return NextResponse.json({ message: `Server Error: ${error.message}` }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body: DatabaseInventoryFormData = await request.json();
        
        // In a real app, use bcrypt to hash the password
        const password_encrypted = body.password; 

        const pool = await getConnection();
        const request = pool.request();
        
        request.input('name', sql.VarChar, body.systemName);
        request.input('zone', sql.VarChar, body.zone);
        // ... add all other inputs
        
        const result = await request.query(`
            INSERT INTO servers (systemName, zone, ...) 
            VALUES (@name, @zone, ...); 
            SELECT * FROM servers WHERE inventoryID = SCOPE_IDENTITY();
        `);

        return NextResponse.json(result.recordset[0], { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ message: `Server Error: ${error.message}` }, { status: 500 });
    }
}
