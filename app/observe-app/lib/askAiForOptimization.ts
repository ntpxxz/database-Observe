export const askAiForOptimization = async (query: string): Promise<string> => {
    const res = await fetch("/api/sql-ai-optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
  
    if (!res.ok) {
      const error = await res.text();
      console.error("AI Error:", error);
      throw new Error("AI Optimization failed");
    }
  
    const data = await res.json();
    return data.suggestion || "No suggestion received.";
  };
  