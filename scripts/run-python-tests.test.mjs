import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createPytestArguments,
  createPytestEnvironment,
  mergeEnvironmentFileValues,
  parseArguments,
  parseEnvironmentFile,
} from "./run-python-tests.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const pythonPackageRoot = path.join(repositoryRoot, "packages/creator-python");

test("parses regular, setup-only, and live-model modes", () => {
  assert.deepEqual(parseArguments([]), {
    liveModel: false,
    setupOnly: false,
  });
  assert.deepEqual(parseArguments(["--setup-only"]), {
    liveModel: false,
    setupOnly: true,
  });
  assert.deepEqual(parseArguments(["--live-model"]), {
    liveModel: true,
    setupOnly: false,
  });
  assert.throws(() => parseArguments(["--unknown"]), /Unknown argument/);
});

test("uses the live marker and live test selection only in live-model mode", () => {
  assert.deepEqual(createPytestArguments({ liveModel: false }), [
    "-m",
    "pytest",
    path.join(pythonPackageRoot, "tests"),
  ]);
  assert.deepEqual(createPytestArguments({ liveModel: true }), [
    "-m",
    "pytest",
    "-m",
    "live_model",
    "-s",
    path.join(pythonPackageRoot, "tests", "live"),
  ]);
});

test("regular and live-model modes use the same PYTHONPATH", () => {
  const environment = {
    PYTHONPATH: path.join("existing", "python", "path"),
    UNRELATED: "preserved",
  };
  const regular = createPytestEnvironment({
    environment,
    liveModel: false,
  });
  const live = createPytestEnvironment({ environment, liveModel: true });

  assert.equal(
    regular.PYTHONPATH,
    [pythonPackageRoot, environment.PYTHONPATH].join(path.delimiter),
  );
  assert.equal(live.PYTHONPATH, regular.PYTHONPATH);
  assert.equal(regular.CREATOR_RUN_LIVE_MODEL, undefined);
  assert.equal(live.CREATOR_RUN_LIVE_MODEL, "1");
  assert.equal(live.UNRELATED, "preserved");
});

test("loads live model settings from the Creator host environment file", () => {
  const fileValues = parseEnvironmentFile(`
# Creator model settings
CREATOR_MODEL_BASE_URL = "https://example.test/v1"
CREATOR_MODEL_API_KEY='file-key'
CREATOR_MODEL_NAME=mimo-v2.5-pro
`);
  const environment = mergeEnvironmentFileValues(
    {
      CREATOR_MODEL_API_KEY: "process-key",
      CREATOR_MODEL_NAME: "",
      UNRELATED: "preserved",
    },
    fileValues,
  );

  assert.deepEqual(fileValues, {
    CREATOR_MODEL_BASE_URL: "https://example.test/v1",
    CREATOR_MODEL_API_KEY: "file-key",
    CREATOR_MODEL_NAME: "mimo-v2.5-pro",
  });
  assert.equal(environment.CREATOR_MODEL_BASE_URL, "https://example.test/v1");
  assert.equal(environment.CREATOR_MODEL_API_KEY, "process-key");
  assert.equal(environment.CREATOR_MODEL_NAME, "mimo-v2.5-pro");
  assert.equal(environment.UNRELATED, "preserved");
});

test("package live-model script delegates portably to the Node runner", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const script = packageJson.scripts["test:python-live-model"];

  assert.equal(script, "node scripts/run-python-tests.mjs --live-model");
  assert.doesNotMatch(script, /\.venv[\\/]bin[\\/]python/);
  assert.doesNotMatch(script, /CREATOR_RUN_LIVE_MODEL=/);
});
