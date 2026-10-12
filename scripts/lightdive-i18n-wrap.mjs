// One-off codemod: wraps the Traditional Chinese text in Lightdive's v3 components for translation.
//   node scripts/lightdive-i18n-wrap.mjs [files…]   (run again until it reports 0 edits)
// - JSX text and string attributes become {tl("…")}.
// - Strings and templates inside functions become tl("…") / tl("…{0}…", { 0: expr }).
// - Module-level constants holding Chinese are wrapped in localized(…), so they are read in the current language.
// Strings that are already the first argument of tl(…) are left alone.
import fs from "node:fs";
import ts from "typescript";

const CJK = /[　-〿一-鿿＀-￯]/;
const files = process.argv.slice(2);
let total = 0;

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = []; // { start, end, text }
  let usesTl = false, usesLocalized = false;

  const inFunction = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return true; return false; };
  const isTlArg = (n) => ts.isCallExpression(n.parent) && n.parent.expression.getText(sf) === "tl" && n.parent.arguments[0] === n;
  const inLocalized = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && p.expression.getText(sf) === "localized") return true; return false; };
  const covered = (n) => edits.some((e) => n.getStart(sf) >= e.start && n.getEnd() <= e.end);
  const skipContext = (n) => {
    const p = n.parent;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p)) return true;
    if (ts.isPropertyAssignment(p) && p.name === n) return true; // object keys
    if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return true;
    if (ts.isCaseClause(p)) return true;
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) return true;
    return false;
  };
  const q = (s) => JSON.stringify(s);

  const visit = (n) => {
    // module-level constants: const X = { … "中文" … }
    if (ts.isVariableStatement(n) && ts.isSourceFile(n.parent)) {
      for (const d of n.declarationList.declarations) {
        const init = d.initializer;
        if (!init || !CJK.test(init.getText(sf))) continue;
        let core = init;
        while (ts.isAsExpression(core) || ts.isSatisfiesExpression?.(core) || ts.isParenthesizedExpression(core)) core = core.expression;
        if (ts.isObjectLiteralExpression(core) || ts.isArrayLiteralExpression(core)) {
          if (ts.isCallExpression(init) && init.expression.getText(sf) === "localized") continue;
          edits.push({ start: init.getStart(sf), end: init.getEnd(), text: `localized(${init.getText(sf)})` });
          usesLocalized = true;
          continue;
        }
      }
    }
    if (ts.isJsxText(n) && CJK.test(n.text)) {
      const raw = n.getFullText(sf);
      const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
      const body = raw.slice(lead.length, raw.length - trail.length).replace(/\s*\n\s*/g, " ");
      if (body) {
        const start = n.getStart(sf, true) + lead.length;
        edits.push({ start: n.pos + lead.length, end: n.end - trail.length, text: `{tl(${q(body)})}` });
        usesTl = true;
      }
      return;
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && CJK.test(n.text) && !isTlArg(n) && !skipContext(n) && !covered(n) && !inLocalized(n)) {
      if (ts.isJsxAttribute(n.parent)) {
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `{tl(${q(n.text)})}` });
        usesTl = true;
        return;
      }
      if (inFunction(n)) {
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `tl(${q(n.text)})` });
        usesTl = true;
        return;
      }
    }
    if (ts.isTemplateExpression(n) && CJK.test(n.getText(sf)) && inFunction(n) && !covered(n) && !inLocalized(n) && !isTlArg(n)) {
      let key = n.head.text;
      const vals = [];
      n.templateSpans.forEach((s, i) => { key += `{${i}}` + s.literal.text; vals.push(`${i}: ${s.expression.getText(sf)}`); });
      if (CJK.test(key)) {
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `tl(${q(key)}, { ${vals.join(", ")} })` });
        usesTl = true;
        return; // nested templates inside the expressions are handled on the next run
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  const has = (name) => new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from "@/lib/lightdive-v3/i18n"`).test(out);
  const need = [usesTl && !has("tl") ? "tl" : null, usesLocalized && !has("localized") ? "localized" : null].filter(Boolean);
  if (need.length) {
    const existing = out.match(/import \{([^}]*)\} from "@\/lib\/lightdive-v3\/i18n";/);
    if (existing) out = out.replace(existing[0], `import { ${[...existing[1].split(",").map((s) => s.trim()).filter(Boolean), ...need].join(", ")} } from "@/lib/lightdive-v3/i18n";`);
    else {
      // after the last import line
      const lines = out.split("\n");
      let at = 0;
      lines.forEach((l, i) => { if (/^import /.test(l) || /^\} from /.test(l)) at = i; });
      lines.splice(at + 1, 0, `import { ${need.join(", ")} } from "@/lib/lightdive-v3/i18n";`);
      out = lines.join("\n");
    }
  }
  fs.writeFileSync(file, out);
  total += edits.length;
  console.log(`${file}: ${edits.length} edits`);
}
console.log(`total ${total} edits`);
