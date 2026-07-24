import { NextRequest, NextResponse } from "next/server";
import { getLocalSkillRegistry } from "@/lib/local-skills/local-skill-registry";
import { getLocalSkillsResponse } from "./route-core";

export async function GET(request: NextRequest) {
  const response = await getLocalSkillsResponse({
    host: request.headers.get("host"),
    registry: getLocalSkillRegistry(),
  });
  return NextResponse.json(response.body, { status: response.status });
}
