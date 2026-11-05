"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Ajv = require(path.join(root, "premid/node_modules/ajv"));
const folder = path.join(root, "premid/websites/O/OPwatch");
const metadata = JSON.parse(fs.readFileSync(path.join(folder, "metadata.json"), "utf8"));
const schema = JSON.parse(fs.readFileSync(path.join(root, "premid/schemas/metadata-1.17.json"), "utf8"));
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
if (!validate(metadata)) {
    console.error(validate.errors);
    process.exit(1);
}
const pattern = new RegExp(metadata.regExp);
for (const host of Array.isArray(metadata.url) ? metadata.url : [metadata.url]) {
    if (!pattern.test(`https://${host}/`)) throw new Error(`regExp does not match listed domain ${host}`);
}
for (const name of ["presence.ts", "iframe.ts", "metadata.json", "tsconfig.json"]) {
    if (!fs.existsSync(path.join(folder, name))) throw new Error(`Missing submission file: ${name}`);
}
console.log("PreMiD metadata schema 1.17, listed-domain matching, and activity structure passed.");
const pending = [];
for (const field of ["logo", "thumbnail"]) {
    if (new URL(metadata[field]).hostname !== "i.imgur.com") pending.push(`${field}: supply a direct Imgur image URL as required by CONTRIBUTING.md`);
}
if (metadata.logo === "https://opieferd.dev/favicon.png") {
    const png = fs.readFileSync(path.join(root, "favicon.png"));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width !== 512 || height !== 512) pending.push(`logo is ${width}x${height}; submission requires 512x512`);
}
if (pending.length) {
    console.warn("Submission requirements still pending:\n- " + pending.join("\n- "));
    if (process.argv.includes("--submission")) process.exitCode = 1;
}
console.log("This local check does not replace pmd --validate, upstream ESLint, live screenshots, or maintainer review.");
