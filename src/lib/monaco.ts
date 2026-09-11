import * as monaco from "monaco-editor/editor/editor.api.js";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import "monaco-editor/editor/browser/coreCommands.js";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/comment/browser/comment.js";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/folding/browser/folding.js";
import "monaco-editor/editor/contrib/format/browser/formatActions.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
import "monaco-editor/editor/contrib/snippet/browser/snippetController2.js";
import "monaco-editor/editor/contrib/suggest/browser/suggestController.js";
import "monaco-editor/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js";
import "monaco-editor/languages/definitions/sql/register.js";
import "monaco-editor/languages/definitions/pgsql/register.js";
import "monaco-editor/languages/definitions/mysql/register.js";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
monaco.editor.defineTheme("granite-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "45638F" },
    { token: "number", foreground: "5F7557" },
    { token: "string", foreground: "8A6350" },
    { token: "comment", foreground: "737373" },
    { token: "operator", foreground: "627080" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.lineHighlightBackground": "#f8f8f8",
    "editorLineNumber.foreground": "#858585",
  },
});
monaco.editor.defineTheme("granite-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "8EAFD3" },
    { token: "number", foreground: "ABC29D" },
    { token: "string", foreground: "BDA28B" },
    { token: "comment", foreground: "929292" },
    { token: "operator", foreground: "A1ACBA" },
  ],
  colors: {
    "editor.background": "#191919",
    "editor.lineHighlightBackground": "#202020",
    "editorLineNumber.foreground": "#858585",
  },
});
export { monaco };
