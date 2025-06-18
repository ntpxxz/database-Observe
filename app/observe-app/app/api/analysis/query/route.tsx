import { NextResponse } from 'next/server';
import { DbType } from '@/types';

// URL ของ Python AI Service ที่ทำงานอยู่ (อ่านจาก Environment Variable)
const AI_SERVICE_URL = process.env.INTERNAL_AI_SERVICE_URL || 'http://localhost:8000';

interface AnalysisRequestBody {
  query: string;
  db_type: DbType;
}

export async function POST(request: Request) {
    try {
        const body: AnalysisRequestBody = await request.json();

        if (!body.query || !body.db_type) {
            return NextResponse.json({ message: 'Query and database type are required.' }, { status: 400 });
        }

        console.log(`Forwarding query to AI service: ${AI_SERVICE_URL}/analyze-query/`);

        // ส่ง Request ต่อไปยัง Python AI Service
        const aiServiceResponse = await fetch(`${AI_SERVICE_URL}/analyze-query/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: body.query,
                db_type: body.db_type,
            }),
        });

        if (!aiServiceResponse.ok) {
            const errorText = await aiServiceResponse.text();
            throw new Error(`AI service responded with an error: ${errorText}`);
        }

        const analysisResult = await aiServiceResponse.json();

        // ส่งผลลัพธ์ที่ได้จาก AI Service กลับไปให้ Frontend
        return NextResponse.json(analysisResult);

    } catch (err: any) {
        console.error("[Query Analysis API Error]", err.message);
        return NextResponse.json({ message: `An internal error occurred: ${err.message}` }, { status: 500 });
    }
}
