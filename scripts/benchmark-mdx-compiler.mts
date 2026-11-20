import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { compileMdx, renderMdxNote } from "../src/lib/markdown/mdx-compiler";

const source = readFileSync(
  resolve(process.cwd(), "../NoteBooks-Developers/research-and-development/mdx-compiler.mdx"),
  "utf8",
);
const sourceInfo = {
  owner: "notebooks",
  repository: "developers",
  branch: "main",
  filePath: "research-and-development/mdx-compiler.mdx",
};

async function measure(run: () => Promise<unknown>, iterations: number): Promise<{
  meanMs: number;
  medianMs: number;
  p95Ms: number;
}> {
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

async function main() {
  process.env.TRUSTED_MDX_REPOSITORIES = "notebooks/developers";

  for (let index = 0; index < 10; index += 1) {
    await compileMdx(source);
    await renderMdxNote(source, sourceInfo);
  }

  const compiled = await compileMdx(source);
  const compiler = await measure(() => compileMdx(source), 50);
  const fullRender = await measure(() => renderMdxNote(source, sourceInfo), 50);

  console.log(JSON.stringify({
    node: process.version,
    iterations: { compiler: 50, fullRender: 50 },
    sourceBytes: Buffer.byteLength(source),
    sourceLines: source.split(/\r?\n/).length,
    compiledJavascriptBytes: Buffer.byteLength(compiled),
    compiler,
    fullRender,
  }, null, 2));
}

void main();
