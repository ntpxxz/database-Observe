"use client";
import React, { FC, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Database } from "lucide-react";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";

interface DatabaseInfo {
  name: string;
  sizeMB: number;
  state: string;
  recoveryModel: string;
  compatibilityLevel: number;
  collation: string;
  createdDate: string;
}

interface Props {
  databaseInfo: DatabaseInfo[];
  inventoryID: string;
}

export const DatabaseTableView: FC<Props> = ({ databaseInfo, inventoryID }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 10;
  const router = useRouter();

  useEffect(() => {
    setCurrentPage(1);
  }, [databaseInfo]);

  if (!databaseInfo || databaseInfo.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-4">
        No databases found.
      </p>
    );
  }

  const totalPages = Math.ceil(databaseInfo.length / ROWS_PER_PAGE);
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const currentData = databaseInfo.slice(
    startIndex,
    startIndex + ROWS_PER_PAGE,
  );
  const handleClick = (dbName: string) => {
    const databaseName = dbName;
    router.push(`/inventory/${inventoryID}/database/${databaseName}/insight`);
  };

  return (
    <>
      <div className="bg-slate-800/50 p-6 rounded-xl border border-white/10">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold flex items-center text-white">
            <Database className="mr-3 text-sky-400" />
            Database Inventory
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-300">
            <thead className="text-xs text-slate-500 uppercase bg-slate-800">
              <tr>
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal text-right">Size (MB)</th>
                <th className="px-4 py-3 font-normal text-right">State</th>
                <th className="px-4 py-3 font-normal text-right">Recovery</th>
                <th className="px-4 py-3 font-normal text-right">Collation</th>
                <th className="px-4 py-3 font-normal text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {currentData.map((db) => (
                <tr
                  key={`${db.name}-${db.createdDate}`}
                  onClick={() => handleClick(db.name)}
                  className="border-b border-slate-700/50 hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3 text-slate-300">{db.name}</td>
                  <td className="px-4 py-3 text-right text-amber-300">
                    {db.sizeMB.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium bg-${
                        db.state === "ONLINE" ? "green" : "red"
                      }-500/10 text-${
                        db.state === "ONLINE" ? "green" : "red"
                      }-400`}
                    >
                      {db.state.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {db.recoveryModel}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {db.collation}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {new Date(db.createdDate).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-between items-center px-4 py-3 text-sm text-slate-400">
        <span>Total Databases: {databaseInfo.length.toLocaleString()}</span>
        <div className="flex items-center gap-4">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-md hover:bg-slate-700 disabled:text-slate-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <ChevronLeft size={20} />
            </Button>
            <Button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="p-1 rounded-md hover:bg-slate-700 disabled:text-slate-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};
