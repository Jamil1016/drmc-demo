import { DB } from "@/lib/db/schemas";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";

/**
 * The Division ("carrier_group") filter options for the approvals pages.
 * Sourced from the v_division_options view = the distinct carrier_group values
 * actually present in the roster/report data, not a hand-curated list (which
 * drifts). 300s cache + "reference-data" tag. Returns the plain label list the
 * column-header multiselect wants. The cached read THROWS on failure so an
 * error is never cached for the TTL; the exported wrapper degrades to [] (the
 * filter just offers no options).
 */
const readDivisionOptions = unstable_cache(listDivisionOptionsUncached, ["division-options"], {
  revalidate: 300,
  tags: ["reference-data"],
});

export async function listDivisionOptions(): Promise<string[]> {
  try {
    return await readDivisionOptions();
  } catch (e) {
    console.error("listDivisionOptions: degraded to []:", e);
    return [];
  }
}

async function listDivisionOptionsUncached(): Promise<string[]> {
  const svc = createServiceClient();
  return withDbRetry(async () => {
    const { data, error } = await svc.schema(DB.analytics).from("v_division_options")
      .select("division").order("division");
    if (error) throw new Error(error.message);
    return ((data ?? []) as { division: string }[])
      .map((r) => r.division)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  });
}
