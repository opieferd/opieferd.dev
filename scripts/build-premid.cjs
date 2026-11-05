"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const root = path.resolve(__dirname, "..");

function compileActivity() {
    if (typeof stripTypeScriptTypes !== "function") throw new Error("Building requires Node.js 22.13 or newer");
    const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
    const runtime = read("premid/runtime.ts").replace(/^export /gm, "");
    const importedHelpers = /^import \{ ActivityType, getTimestamps \} from 'premid'\r?\n/m;
    const files = { "metadata.json": read("premid/OPwatch/metadata.json") };
    for (const name of ["presence", "iframe"]) {
        let source = read(`premid/OPwatch/${name}.ts`);
        let bundled = "";
        if (name === "presence") {
            if (!importedHelpers.test(source)) throw new Error("Update the offline bundler for changed PreMiD imports");
            source = source.replace(importedHelpers, "");
            bundled = runtime + "\n";
        }
        // Node removes interfaces/generics and transforms TypeScript enums.
        // The activity has no other dependencies; reject unresolved imports.
        const js = stripTypeScriptTypes(bundled + source, { mode: "transform" });
        if (/^\s*(?:import|export)\s/m.test(js)) throw new Error(`Unresolved module in ${name}`);
        files[`${name}.js`] = `(() => {\n"use strict";\n${js}\n})();\n`;
        new vm.Script(files[`${name}.js`], { filename: `${name}.js` });
    }
    return files;
}
if (require.main === module) process.stdout.write(JSON.stringify(compileActivity()));
module.exports = { compileActivity };
