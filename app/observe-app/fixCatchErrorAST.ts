import fs from "fs";
import path from "path";
import * as parser from "@babel/parser";
import * as t from "@babel/types";
import prettier from "prettier";

// ✅ Babel traverse fix
import traverseModule from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
const traverse = (traverseModule as any).default || traverseModule;

// ✅ Babel generator fix
import generateModule from "@babel/generator";
const generate = (generateModule as any).default || generateModule;

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_DIR = path.resolve(__dirname, "../observe-app");

function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      results.push(filePath);
    }
  }
  return results;
}

async function patchCatchMessageOnly(
  code: string,
  filePath: string,
): Promise<string> {
  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  traverse(ast, {
    CatchClause(path: NodePath<t.CatchClause>) {
      const param = path.node.param;

      if (
        param &&
        t.isIdentifier(param) &&
        t.isTSTypeAnnotation(param.typeAnnotation) &&
        t.isTSUnknownKeyword(param.typeAnnotation.typeAnnotation)
      ) {
        const varName = param.name;

        const hasMessage = path.node.body.body.some(
          (stmt: t.Statement) =>
            t.isVariableDeclaration(stmt) &&
            stmt.declarations.some((d) =>
              t.isIdentifier(d.id, { name: "message" }),
            ),
        );

        if (!hasMessage) {
          const messageDecl = t.variableDeclaration("const", [
            t.variableDeclarator(
              t.identifier("message"),
              t.conditionalExpression(
                t.binaryExpression(
                  "instanceof",
                  t.identifier(varName),
                  t.identifier("Error"),
                ),
                t.memberExpression(
                  t.identifier(varName),
                  t.identifier("message"),
                ),
                t.stringLiteral("Unknown error"),
              ),
            ),
          ]);

          path.node.body.body.unshift(messageDecl);
        }
      }
    },
  });

  const output = generate(ast, { retainLines: true }).code;

  // ✅ ปรับตรงนี้ให้แสดงชื่อไฟล์เมื่อ prettier พัง
  let formatted = output;
  try {
    formatted = await prettier.format(output, { parser: "typescript" });
  } catch (e) {
    console.warn(`⚠️  Prettier failed to format file: ${filePath}`);
  }

  return formatted;
}

async function runFix() {
  const files = walk(TARGET_DIR);
  let modified = 0;

  console.log(`📁 Scanning ${files.length} file(s) in ${TARGET_DIR}`);

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const transformed = await patchCatchMessageOnly(raw, file);

    if (raw !== transformed) {
      fs.writeFileSync(file, transformed, "utf8");
      console.log(`✅ Patched: ${file}`);
      modified++;
    } else {
      console.log(`⏩ Skipped: ${file}`);
    }
  }

  console.log(`\n🎉 Done. Modified ${modified} file(s).`);
}

runFix();
