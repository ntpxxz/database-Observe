import { NextRequest } from "next/server";


export async function parseJsonRequest(req: NextRequest) {
    try {
      return await req.json();
    } catch {
      throw new Error("Invalid JSON body");
    }
  }
  