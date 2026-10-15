import semver from "semver";

export const LEXICAL_PEERS = ["lexical", "@lexical/react", "@lexical/utils", "@lexical/history", "@lexical/plain-text"];
export const REACT_LEXICAL = "@assistant-ui/react-lexical";

export function validateLexicalIntegration(manifest, reactVersion, versions) {
  const reactRange = manifest.peerDependencies?.["@assistant-ui/react"];
  if (!semver.validRange(reactRange) || !semver.satisfies(reactVersion, reactRange)) {
    throw new Error(`${REACT_LEXICAL}@${manifest.version} requires @assistant-ui/react ${reactRange}; target is ${reactVersion}. Review the integration before upgrading.`);
  }
  for (const name of LEXICAL_PEERS) {
    const range = manifest.peerDependencies?.[name];
    if (!range || !semver.validRange(range) || !semver.valid(versions[name]) || !semver.satisfies(versions[name], range)) {
      throw new Error(`${name}@${versions[name]} does not satisfy ${REACT_LEXICAL} peer requirement ${range}. Review the integration before upgrading.`);
    }
  }
  // These packages ship together; even patch releases must be identical.
  if (new Set(LEXICAL_PEERS.map(name => versions[name])).size !== 1) {
    throw new Error("assistant-ui Lexical peer requirements no longer resolve to one supported Lexical release family. Review the integration before upgrading.");
  }
}

export async function resolveLexicalPeerVersions(manifest, reactVersion, versionsResolver) {
  const versions = Object.fromEntries(await Promise.all(LEXICAL_PEERS.map(async name => {
    const range = manifest.peerDependencies?.[name];
    if (!range || !semver.validRange(range)) throw new Error(`Missing or unsupported ${name} peer requirement: ${range}`);
    const published = await versionsResolver(name, range);
    const version = semver.maxSatisfying(Array.isArray(published) ? published : [published], range);
    if (!version) throw new Error(`No published ${name} version satisfies upstream peer requirement ${range}.`);
    return [name, version];
  })));
  validateLexicalIntegration(manifest, reactVersion, versions);
  return versions;
}
