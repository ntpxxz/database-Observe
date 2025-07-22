import React, { FC, useState, useEffect } from "react";
import { X, Lightbulb, GitBranch, Bot, Database } from "lucide-react";
import { PerformanceInsight } from "@/types/index";

interface QueryAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: PerformanceInsight | null;
}

export const QueryAnalysisModal: FC<QueryAnalysisModalProps> = ({
  isOpen,
  onClose,
  query,
}) => {
  const [activeTab, setActiveTab] = useState<"suggestion" | "plan">(
    "suggestion",
  );
  const [aiSuggestion, setAiSuggestion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (query && isOpen) {
      setActiveTab("suggestion"); // Reset to suggestion tab on open
      setIsLoading(true);

      // Simulate fetching AI suggestion
      const fetchAiSuggestion = async () => {
        try {
          // In a real application, you would make a POST request to your Python AI service
          // const response = await fetch('http://localhost:8000/analyze-query/', {
          //     method: 'POST',
          //     headers: { 'Content-Type': 'application/json' },
          //     body: JSON.stringify({ query: query.query, db_type: 'POSTGRES' }) // db_type should be dynamic
          // });
          // const data = await response.json();
          // setAiSuggestion(data.suggestion);

          // Mocking the AI response for now
          setTimeout(() => {
            let suggestion =
              "No specific suggestion available. Review the query execution plan for performance bottlenecks and ensure appropriate indexes are in place.";
            if (query.query.toUpperCase().includes("SELECT *")) {
              suggestion =
                "Consider avoiding 'SELECT *' as it can cause full table scans. Specify only the columns you need.";
            } else if (query.query.toUpperCase().includes("LIKE '%")) {
              suggestion =
                "Using a leading wildcard with LIKE (e.g., LIKE '%value') prevents the use of standard indexes. Consider using a Full-Text Search solution if this is a common pattern.";
            }
            setAiSuggestion(suggestion);
            setIsLoading(false);
          }, 1000);
        } catch (error) {
          console.error("Failed to fetch AI suggestion:", error);
          setAiSuggestion("Could not retrieve AI suggestion at this time.");
          setIsLoading(false);
        }
      };

      fetchAiSuggestion();
    }
  }, [query, isOpen]);

  if (!isOpen || !query) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
      <div className="bg-slate-800 rounded-lg shadow-2xl p-8 w-full max-w-4xl border border-white/10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-sky-400 flex items-center">
            <Database className="mr-3" /> Query Analysis
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="mb-6">
          <h3 className="font-semibold text-slate-400">Query:</h3>
          <p className="bg-slate-900 p-3 rounded-md mt-1 font-mono text-sm text-amber-300">
            {query.query}
          </p>
        </div>

        <div className="border-b border-slate-700">
          <nav className="-mb-px flex space-x-6">
            <button
              onClick={() => setActiveTab("suggestion")}
              className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === "suggestion" ? "border-sky-500 text-sky-400" : "border-transparent text-slate-500 hover:text-slate-300"}`}
            >
              <Lightbulb size={16} className="inline-block mr-2" />
              AI Suggestion
            </button>
            <button
              onClick={() => setActiveTab("plan")}
              className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === "plan" ? "border-sky-500 text-sky-400" : "border-transparent text-slate-500 hover:text-slate-300"}`}
            >
              <GitBranch size={16} className="inline-block mr-2" />
              Execution Plan
            </button>
          </nav>
        </div>

        <div className="pt-6 max-h-[50vh] overflow-y-auto pr-4">
          {activeTab === "suggestion" && (
            <div className="pt-4">
              <h3 className="font-semibold text-lg text-green-400 flex items-center">
                <Bot className="mr-2" /> Optimization Suggestion:
              </h3>
              {isLoading ? (
                <p className="bg-slate-900 p-4 rounded-md mt-2 text-slate-400 animate-pulse">
                  Analyzing query...
                </p>
              ) : (
                <p className="bg-slate-900 p-4 rounded-md mt-2 text-green-300 whitespace-pre-wrap">
                  {aiSuggestion}
                </p>
              )}
            </div>
          )}
          {activeTab === "plan" && (
            <div>
              <h3 className="font-semibold text-lg text-blue-400 mb-2">
                Execution Plan
              </h3>
              <p className="text-slate-500 text-sm">
                Execution plan visualization is a future feature. This would
                show a tree view of the query execution steps.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
