import { expect, it } from 'vitest';
import { parseAppUIModel, buildLayoutRefIndex } from '../src/framework/contracts/app-ui-model';
import { applyAppUIOperations } from '../src/project/app-ui-operations';

it('preserves semantic view identities and default selection when named Stack children move or disappear', () => {
  const model = parseAppUIModel({ root: { type: 'stack', id: 'main', keepMounted: true, activeIndex: 1,
    viewIds: ['chat', 'files'],
    children: [{ type: 'slot', plugins: [] }, { type: 'slot', plugins: [] }],
  } });
  if (model.root.type !== 'stack') throw new Error('Expected Stack');
  const refs = buildLayoutRefIndex(model.root);
  const moved = parseAppUIModel(applyAppUIOperations(model, [{ type: 'move_layout_node',
    nodeRef: refs.byNode.get(model.root.children[1]!)!, newParentRef: refs.byNode.get(model.root)!, index: 0,
  }]));
  expect(moved.root).toMatchObject({ id: 'main', viewIds: ['files', 'chat'], activeIndex: 0, keepMounted: true });
  if (moved.root.type !== 'stack') throw new Error('Expected Stack');
  const nextRefs = buildLayoutRefIndex(moved.root);
  const removed = parseAppUIModel(applyAppUIOperations(moved, [{ type: 'remove_layout_node', nodeRef: nextRefs.byNode.get(moved.root.children[0]!)! }]));
  expect(removed.root).toMatchObject({ id: 'main', viewIds: ['chat'], activeIndex: 0 });
});

it('supports additive Stack properties in controlled replacements and keeps unnamed legacy Stack unchanged', () => {
  const original = parseAppUIModel({ root: { type: 'slot', plugins: [] } });
  const next = parseAppUIModel(applyAppUIOperations(original, [{ type: 'replace_layout_node', nodeRef: 'l0', node: {
    type: 'stack', id: 'main', keepMounted: true, viewIds: ['chat'], children: [{ type: 'slot', plugins: [] }],
  } }]));
  expect(next.root).toMatchObject({ id: 'main', viewIds: ['chat'], keepMounted: true });
  const legacy = parseAppUIModel({ root: { type: 'stack', children: [] } });
  expect(legacy.root).toEqual({ type: 'stack', children: [] });
});

it('updates Stack identity and navigation with ordinary property operations while preserving existing content', () => {
  const original = parseAppUIModel({ root: { type: 'stack', children: [
    { type: 'slot', plugins: [] }, { type: 'slot', plugins: [] },
  ] } });
  const configured = parseAppUIModel(applyAppUIOperations(original, [{ type: 'update_layout_node_props', nodeRef: 'l0',
    set: { id: 'main', viewIds: ['chat', 'projects'], keepMounted: true },
  }]));
  expect(configured.root).toMatchObject({ id: 'main', viewIds: ['chat', 'projects'], keepMounted: true });
  if (configured.root.type !== 'stack' || original.root.type !== 'stack') throw new Error('Expected Stack');
  expect(configured.root.children).toEqual(original.root.children);
});
