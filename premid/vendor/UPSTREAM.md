# PreMiD runtime source

The unmodified `premid` runtime source and license are copied from
PreMiD/Activities at ce94323cfba763f14412281aeebc34ea80887596.

https://github.com/PreMiD/Activities/tree/ce94323cfba763f14412281aeebc34ea80887596/premid

This allows esbuild to resolve the real `premid` imports during local builds.
The submission source imports `premid` normally and uses the upstream package
when copied into PreMiD/Activities. Do not submit the tooling or vendor folder.
