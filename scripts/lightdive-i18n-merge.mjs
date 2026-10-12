// One-off codemod after lightdive-i18n-wrap: merges sentence fragments that sit next to values inside one JSX element,
//   {tl("第")} {c.deck} {tl("副")}   →   {tl("第 {0} 副", { 0: c.deck })}
// so each language can order the words itself. Only plain values are merged (no JSX, no && / || / ?: expressions).
//   node scripts/lightdive-i18n-merge.mjs [files…]
import fs from "node:fs";
import ts from "typescript";

let total = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const classify = (c) => {
    if (ts.isJsxText(c)) {
      if (c.getFullText(sf).trim()) return null; // real text would have been wrapped already
      return { kind: "W", text: /\n/.test(c.getFullText(sf)) ? "" : " " };
    }
    if (ts.isJsxExpression(c) && c.expression) {
      const e = c.expression;
      if (ts.isCallExpression(e) && e.expression.getText(sf) === "tl" && e.arguments.length === 1 && ts.isStringLiteral(e.arguments[0])) return { kind: "T", text: e.arguments[0].text };
      const txt = e.getText(sf);
      if (/<|&&|\|\||\?|tl\(|=>/.test(txt)) return null;
      return { kind: "E", text: txt };
    }
    return null;
  };
  const visit = (n) => {
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      const kids = n.children;
      let i = 0;
      while (i < kids.length) {
        const run = [];
        let j = i;
        while (j < kids.length) { const k = classify(kids[j]); if (!k) break; run.push({ ...k, node: kids[j] }); j++; }
        // trim whitespace at both ends of the run
        while (run.length && run[0].kind === "W") run.shift();
        while (run.length && run.at(-1).kind === "W") run.pop();
        const tCount = run.filter((r) => r.kind === "T").length, eCount = run.filter((r) => r.kind === "E").length;
        if (tCount >= 1 && eCount >= 1) {
          let key = "", vals = [], idx = 0;
          for (const r of run) {
            if (r.kind === "T") key += r.text;
            else if (r.kind === "W") key += r.text;
            else { key += `{${idx}}`; vals.push(`${idx}: ${r.text}`); idx++; }
          }
          const start = run[0].node.getStart(sf), end = run.at(-1).node.getEnd();
          edits.push({ start, end, text: `{tl(${JSON.stringify(key)}, { ${vals.join(", ")} })}` });
        }
        i = Math.max(j, i + 1);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  fs.writeFileSync(file, out);
  total += edits.length;
  console.log(`${file}: ${edits.length} merges`);
}
console.log(`total ${total} merges`);
