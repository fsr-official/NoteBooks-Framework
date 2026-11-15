import { getDesmosApiScript } from "@/lib/desmos-api";

export async function GET() {
  return getDesmosApiScript("3d");
}
