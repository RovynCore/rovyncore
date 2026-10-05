// One-off, AST-based mechanical migration of first-party UI copy.
import fs from 'node:fs';
import ts from 'typescript';
const files = ['app/page.tsx', 'app/launch/page.tsx', 'app/genesis/page.tsx', 'app/admin/page.tsx', 'app/token/[address]/page.tsx', 'components/platform-provider.tsx', 'components/token-actions.tsx'];
const chinese = /[\u3400-\u9fff]/;
const normalize = s => s.replace(/\s+/g, ' ').trim();
const strings = new Set();
const migrate = process.argv.includes('--write');
const components = new Set(['Discover','Launch','Genesis','Admin','TokenPage','PlatformProvider','BoostButton','TokenAvatar']);
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const replace = (node, text) => edits.push({ start: node.getStart(root), end: node.end, text });
  function visit(n) {
    if (ts.isFunctionDeclaration(n) && components.has(n.name?.text) && n.body) edits.push({ start: n.body.getStart(root)+1, end: n.body.getStart(root)+1, text: '\n  const { tr, locale } = useLanguage();\n' });
    if (ts.isJsxText(n) && chinese.test(n.text)) {
      const key = normalize(n.text); strings.add(key);
      edits.push({ start:n.pos, end:n.end, text: `{tr(${JSON.stringify(key)})}` });
      return;
    }
    else if (ts.isStringLiteral(n) && chinese.test(n.text)) {
      strings.add(n.text);
      const call = `tr(${JSON.stringify(n.text)})`;
      replace(n, ts.isJsxAttribute(n.parent) ? `{${call}}` : call);
      return;
    }
    else if (ts.isTemplateExpression(n) && chinese.test(n.getText(root))) {
      const key = n.head.text + n.templateSpans.map((s,i) => `{${i}}` + s.literal.text).join(''); strings.add(key);
      replace(n, `tr(${JSON.stringify(key)}, {${n.templateSpans.map((s,i) => `${i}: ${s.expression.getText(root)}`).join(', ')}})`);
      return;
    }
    ts.forEachChild(n, visit);
  }
  visit(root);
  if (migrate && !source.includes('useLanguage')) {
    let result = source;
    for (const edit of edits.sort((a,b) => b.start-a.start)) result = result.slice(0,edit.start)+edit.text+result.slice(edit.end);
    result = result.replace('"use client";', '"use client";\nimport { useLanguage, translateRuntime as tr } from "@/components/language-provider";');
    result = result.replaceAll('toLocaleDateString("zh-TW")', 'toLocaleDateString(locale)').replaceAll('toLocaleString("zh-TW")', 'toLocaleString(locale)');
    fs.writeFileSync(file, result);
  }
}
console.log(JSON.stringify([...strings], null, 2));
