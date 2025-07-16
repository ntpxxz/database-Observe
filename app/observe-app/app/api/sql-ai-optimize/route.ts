export const runtime = 'nodejs'; // ถ้าใช้ Edge ต้องตัด fetch localhost ออก

export const POST = async (req: Request) => {
  try {
    const { query } = await req.json();

    const prompt = `
You are a SQL optimization expert. Please analyze the following SQL query, identify potential issues, and suggest improvements. 
Then provide an optimized version of the query (if possible), explain why your version is better.

SQL Query:
${query}
`;

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sqlcoder",
        prompt: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Ollama error:", error);
      return new Response(
        JSON.stringify({ error: "Ollama response error", detail: error }),
        { status: 500 }
      );
    }

    const result = await response.json();

    return new Response(
      JSON.stringify({
        suggestion: result.response?.trim() || "No response from LLM.",
      }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error("AI Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
};
