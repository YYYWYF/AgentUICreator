import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
const picomatch = createRequire(import.meta.url)("picomatch");
export function matchesGlob(name, pattern) {
    if (pattern.length > 1000 || pattern.includes("\\") || pattern.split("/").includes(".."))
        throw new Error("CREATOR_GLOB_INVALID");
    return picomatch(pattern, { dot: true, posixSlashes: true, maxLength: 1000 })(name);
}
// A regular expression runs outside the Agent's event loop and is terminated
// on its deadline. Only bounded source text is sent to this fixed worker.
export async function regexSearch(files, pattern, signal) {
    signal.throwIfAborted();
    if (pattern.length > 1000)
        throw new Error("CREATOR_SEARCH_PATTERN_TOO_LARGE");
    return new Promise((resolve, reject) => {
        const worker = new Worker(`const {parentPort,workerData}=require('node:worker_threads');
      try { const expression=new RegExp(workerData.pattern,'u'); const hits=[];
      for(const file of workerData.files){let count=0;const matches=[];const lines=file.content.split('\\n');
      for(let index=0;index<lines.length;index++){if(expression.test(lines[index])){count++;if(matches.length<100)matches.push({line:index+1,text:lines[index].slice(0,1500)});}}
      if(count)hits.push({path:file.path,matches,count});if(hits.length>=100)break;}
      parentPort.postMessage({hits}); }catch(error){parentPort.postMessage({error:error.message});}`, { eval: true, workerData: { files, pattern }, resourceLimits: { maxOldGenerationSizeMb: 32 } });
        let done = false;
        const finish = (error, value) => { if (done)
            return; done = true; clearTimeout(timer); signal.removeEventListener("abort", abort); void worker.terminate(); error ? reject(error) : resolve(value); };
        const abort = () => finish(new Error("CREATOR_RUN_STOPPED"));
        const timer = setTimeout(() => finish(new Error("CREATOR_REGEX_TIMEOUT")), 500);
        signal.addEventListener("abort", abort, { once: true });
        worker.once("message", result => result.error ? finish(new Error("CREATOR_REGEX_INVALID: " + result.error)) : finish(undefined, result.hits));
        worker.once("error", error => finish(error instanceof Error ? error : new Error(String(error))));
        worker.once("exit", () => { if (!done)
            finish(new Error("CREATOR_REGEX_WORKER_EXITED")); });
        if (signal.aborted)
            abort();
    });
}
//# sourceMappingURL=search.js.map