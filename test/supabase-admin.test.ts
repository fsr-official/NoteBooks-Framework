import { afterEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

describe("createSupabaseAdminClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("uses the server URL when configured", () => {
    vi.stubEnv("SUPABASE_URL", "https://server.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://public.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    createClient.mockReturnValue("supabase-client");

    expect(createSupabaseAdminClient()).toBe("supabase-client");
    expect(createClient).toHaveBeenCalledWith(
      "https://server.example.test",
      "service-role-key",
      expect.any(Object),
    );
  });

  it("falls back to the public project URL if the server URL is missing", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://public.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    createClient.mockReturnValue("supabase-client");

    expect(createSupabaseAdminClient()).toBe("supabase-client");
    expect(createClient).toHaveBeenCalledWith(
      "https://public.example.test",
      "service-role-key",
      expect.any(Object),
    );
  });

  it("reports all accepted URL and service key names when configuration is missing", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    expect(() => createSupabaseAdminClient()).toThrow(
      "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be configured on the server",
    );
  });
});
