import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { isRepositoryMdxRenderingEnabled } from "../src/lib/mdx-feature-flag";

describe("repository MDX rendering setting", () => {
  let query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    from = vi.fn().mockReturnValue(query);
    createSupabaseAdminClient.mockReturnValue({ from });
  });

  it("enables only a repository row with the setting enabled", async () => {
    query.maybeSingle.mockResolvedValue({
      data: { mdx_styled_rendering: true },
      error: null,
    });

    await expect(isRepositoryMdxRenderingEnabled("fsr-official", "NoteBooks-Developers"))
      .resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("repository_entries");
    expect(query.select).toHaveBeenCalledWith("mdx_styled_rendering");
    expect(query.eq).toHaveBeenNthCalledWith(1, "record_type", "repository");
    expect(query.eq).toHaveBeenNthCalledWith(2, "repo_owner", "fsr-official");
    expect(query.eq).toHaveBeenNthCalledWith(3, "repo_name", "NoteBooks-Developers");
  });

  it("keeps missing and disabled repository rows off", async () => {
    query.maybeSingle.mockResolvedValueOnce({
      data: { mdx_styled_rendering: false },
      error: null,
    });
    await expect(isRepositoryMdxRenderingEnabled("owner-disabled", "repo"))
      .resolves.toBe(false);

    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(isRepositoryMdxRenderingEnabled("owner-missing", "repo"))
      .resolves.toBe(false);
  });
});
