import { describe, expect, it } from "vitest";
import { parseAdminRepositoryInput } from "../src/lib/admin-repository-input";

const validRepository = {
  account_id: "student-01",
  branch: "main",
  class_or_stream: "science",
  empty: false,
  enabled: true,
  fallback: null,
  lfs: false,
  pages: false,
  priority: 10,
  registry_name: "Science Notes",
  repo_name: "notes",
  repo_owner: "owner",
  root: "notes",
};

describe("admin repository input", () => {
  it("accepts a complete repository record and an optional responsible account", () => {
    expect(parseAdminRepositoryInput(validRepository)).toEqual(validRepository);
    expect(parseAdminRepositoryInput({ ...validRepository, account_id: null })).toMatchObject({
      account_id: null,
      repo_name: "notes",
    });
  });

  it("rejects incomplete or unknown repository fields", () => {
    expect(parseAdminRepositoryInput({ registry_name: "Notes" })).toBeNull();
    expect(parseAdminRepositoryInput({ ...validRepository, unexpected: true })).toBeNull();
    expect(parseAdminRepositoryInput({ ...validRepository, class_or_stream: "issues" })).toBeNull();
  });

  it("rejects invalid GitHub identifiers, unsafe roots, and malformed scalar values", () => {
    expect(parseAdminRepositoryInput({ ...validRepository, repo_owner: "../owner" })).toBeNull();
    expect(parseAdminRepositoryInput({ ...validRepository, root: "../private" })).toBeNull();
    expect(parseAdminRepositoryInput({ ...validRepository, priority: -1 })).toBeNull();
    expect(parseAdminRepositoryInput({ ...validRepository, enabled: "yes" })).toBeNull();
    expect(parseAdminRepositoryInput({ ...validRepository, account_id: "invalid account" })).toBeNull();
  });

  it("supports non-empty partial updates only", () => {
    expect(parseAdminRepositoryInput({ branch: "release/2026" }, { partial: true })).toEqual({
      branch: "release/2026",
    });
    expect(parseAdminRepositoryInput({}, { partial: true })).toBeNull();
    expect(parseAdminRepositoryInput({ branch: "" }, { partial: true })).toBeNull();
  });
});
