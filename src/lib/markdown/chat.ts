import MarkdownIt from "markdown-it";
import katex from "katex";
import texmath from "markdown-it-texmath";

const parser = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
}).use(texmath, {
  engine: katex,
  delimiters: ["dollars", "brackets"],
  katexOptions: { throwOnError: false, strict: "ignore", output: "html" },
});

parser.renderer.rules.link_open = (tokens, index, options, _environment, renderer) => {
  const token = tokens[index];
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noopener noreferrer");
  return renderer.renderToken(tokens, index, options);
};

parser.renderer.rules.image = (tokens, index) => {
  const altText = parser.utils.escapeHtml(tokens[index].content);
  return altText ? `<span class="reader-chat-image-label">Image: ${altText}</span>` : "";
};

export function renderChatMarkdown(markdown: string): string {
  return parser.render(markdown);
}
