declare module "markdown-it-footnote" {
  import type MarkdownIt from "markdown-it";
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module "markdown-it-sub" {
  import type MarkdownIt from "markdown-it";
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module "markdown-it-sup" {
  import type MarkdownIt from "markdown-it";
  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  const plugin: MarkdownIt.PluginWithOptions<{ enabled?: boolean }>;
  export default plugin;
}

declare module "markdown-it-texmath" {
  import type MarkdownIt from "markdown-it";
  import type { KatexOptions } from "katex";
  const plugin: MarkdownIt.PluginWithOptions<{
    engine?: typeof import("katex");
    delimiters?: string | string[];
    katexOptions?: KatexOptions;
  }>;
  export default plugin;
}
