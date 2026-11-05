"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const esbuild = require(path.join(root, "premid/node_modules/esbuild"));
const activity = path.join(root, "premid/websites/O/OPwatch");

function compileActivity() {
    const result = esbuild.buildSync({
        entryPoints: [path.join(activity, "presence.ts"), path.join(activity, "iframe.ts")],
        outdir: path.join(activity, "dist"),
        bundle: true,
        minify: true,
        sourcemap: "inline",
        tsconfigRaw: { compilerOptions: { target: "ES2022", useDefineForClassFields: true } },
        write: false
    });
    const files = { "metadata.json": fs.readFileSync(path.join(activity, "metadata.json"), "utf8") };
    for (const output of result.outputFiles) {
        const name = path.basename(output.path);
        new vm.Script(output.text, { filename: name });
        files[name] = output.text;
    }
    return files;
}
if (require.main === module) process.stdout.write(JSON.stringify(compileActivity()));
module.exports = { compileActivity };
