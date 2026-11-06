import { checkExampleHost, exampleHosts } from "./prepare-example-host.mjs";

for (const mode of Object.keys(exampleHosts)) await checkExampleHost(mode);
console.log("Example Host project inspections: OK");
