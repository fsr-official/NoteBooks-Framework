import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { compileMdx, renderMdxNote } from "@/lib/markdown/mdx-compiler";

const fixturePath = resolve(
  process.cwd(),
  "../NoteBooks-Developers/research-and-development/mdx-compiler.mdx",
);
const source = existsSync(fixturePath) ? readFileSync(fixturePath, "utf8") : null;
const sourceInfo = {
  owner: "notebooks",
  repository: "developers",
  branch: "main",
  filePath: "research-and-development/mdx-compiler.mdx",
};

async function measure(run: () => Promise<unknown>, iterations: number) {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  samples.sort((left, right) => left - right);
  return {
    meanMs: Number((samples.reduce((sum, sample) => sum + sample, 0) / samples.length).toFixed(3)),
    medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(3)),
    p95Ms: Number(samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)].toFixed(3)),
  };
}

describe("MDX compiler benchmark", () => {
  if (!source) {
    it.skip("reports compile and full React-render timings for the documentation fixture", () => {});
  } else {
    it("reports compile and full React-render timings for the documentation fixture", async () => {
      const previousTrustList = process.env.TRUSTED_MDX_REPOSITORIES;
      process.env.TRUSTED_MDX_REPOSITORIES = "notebooks/developers";
      try {
        for (let index = 0; index < 3; index += 1) {
          await compileMdx(source);
          await renderMdxNote(source, sourceInfo);
        }

        const compiled = await compileMdx(source);
        const compiler = await measure(() => compileMdx(source), 20);
        const fullRender = await measure(() => renderMdxNote(source, sourceInfo), 20);
        console.info(JSON.stringify({
          node: process.version,
          iterations: { compiler: 20, fullRender: 20 },
          sourceBytes: Buffer.byteLength(source),
          sourceLines: source.split(/\r?\n/).length,
          compiledJavascriptBytes: Buffer.byteLength(compiled),
          compiler,
          fullRender,
        }));
        expect(compiled).toContain("function _createMdxContent");
      } finally {
        if (previousTrustList === undefined) delete process.env.TRUSTED_MDX_REPOSITORIES;
        else process.env.TRUSTED_MDX_REPOSITORIES = previousTrustList;
      }
    }, 30_000);
  }
});
