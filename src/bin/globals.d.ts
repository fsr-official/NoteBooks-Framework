declare const MathJax: any;
declare const mermaid: any;
declare const Desmos: any;
declare const hljs: any;
declare const markdownit: any;
declare const markdownitSub: any;
declare const markdownitSup: any;
declare const markdownitFootnote: any;
declare const grecaptcha: any;
declare const SSHAuth: any;

interface Window {
  ModernAuthInstance?: any;
  obsidianInitCalloutFolds?: () => void;
  obsidianInitMath?: () => void;
  obsidianInitTikz?: () => void;
  obsidianInitMermaid?: () => void;
  obsidianInitDesmos?: () => void;
  obsidianInitDesmos3D?: () => void;
  obsidianInitHighlight?: () => void;
  obsidianParseFrontmatter?: (input: string) => any;
  obsidianGetCSS?: () => string;
  obsidianGetToggleScript?: () => string;
  obsidianPlugin?: any;
  md?: any;
  _currentNotePath?: string;
  updateCheckStarted?: boolean;
}
