import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Invalid SQL query' },
        { status: 400 }
      );
    }

    const prompt = `
You are a SQL performance optimization expert. Please analyze the following SQL query, identify potential issues, and provide suggestions to optimize it.
Also include an optimized version of the query (if possible) with explanation.

SQL Query:
${query}
`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    return NextResponse.json({ suggestion: response.trim() });
  } catch (error: unknown) {
    console.error('Gemini Agent Error:', error);
    return NextResponse.json(
      { datails: error|| 'Unknown error' },
      { status: 500 }
    );
  }
}
