import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { translations, translate, localeNames } from "../lib/translations.ts";
import { legalCopy } from "../lib/legal-copy.ts";
test("every migrated UI key has all four translations", () => {
  const files = [
    "app/page.tsx",
    "app/home-redesign/page.tsx",
    "app/launch/page.tsx",
    "app/genesis/page.tsx",
    "app/admin/page.tsx",
    "app/token/[address]/page.tsx",
    "app/explore/page.tsx",
    "app/launchpad/page.tsx",
    "app/onchain-record/page.tsx",
    "app/assets/robinhood/[contract]/page.tsx",
    "app/rvyn/page.tsx",
    "app/verify/page.tsx",
    "app/legal/page.tsx",
    "components/platform-provider.tsx",
    "components/token-actions.tsx",
    "components/verify-module.tsx",
  ];
  const missing: string[] = [];
  for (const file of files) {
    const root = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(n: ts.Node) {
      if (
        ts.isCallExpression(n) &&
        n.expression.getText(root) === "tr" &&
        n.arguments[0] &&
        ts.isStringLiteral(n.arguments[0])
      ) {
        const key = n.arguments[0].text;
        if (!translations[key]) missing.push(`${file}: ${key} (missing key)`);
        else for (const locale of Object.keys(localeNames))
          if (typeof translations[key][locale as keyof typeof localeNames] !== "string")
            missing.push(`${file}: ${key} (${locale})`);
      }
      ts.forEachChild(n, visit);
    }
    visit(root);
  }
  assert.deepEqual(missing, []);
});
test("interpolation preserves user data and four legal versions identify the operator", () => {
  assert.equal(
    translate("發射 {0}", "en", { 0: "使用者 Token" }),
    "Launch 使用者 Token",
  );
  assert.equal(translate("User supplied story", "ko"), "User supplied story");
  for (const copy of Object.values(legalCopy)) {
    assert.ok(JSON.stringify(copy).includes("Sean"));
    assert.ok(JSON.stringify(copy).includes("30"));
    assert.equal(copy.sections.length, 7);
  }
});
