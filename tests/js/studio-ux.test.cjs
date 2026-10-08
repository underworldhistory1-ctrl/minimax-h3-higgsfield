const assert = require('node:assert/strict');
const test = require('node:test');
class Node {
  constructor(type, text = '') { this.type = type; this.textContent = text; this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
}
global.document = {
  createTextNode: text => new Node('text', text),
  createElement: type => new Node(type),
  addEventListener() {},
};
require('../../web/h3/studio-ux.js');
test('Mention rendering preserves untrusted prose as text and supports multilingual aliases', () => {
  const container = new Node('div');
  H3StudioUX.mentionNodes(container, '<img src=x onerror=alert(1)> @actor @شخص_1');
  assert.equal(container.children[0].type, 'text');
  assert.match(container.children[0].textContent, /<img/);
  assert.deepEqual(container.children.filter(n => n.type === 'span').map(n => n.textContent), ['@actor', '@شخص_1']);
  assert.ok(container.children.filter(n => n.type === 'span').every(n => n.className === 'reference-mention'));
});
test('Mention rendering preserves newlines and clears older content', () => {
  const container = new Node('div');
  H3StudioUX.mentionNodes(container, '@first\nsecond');
  H3StudioUX.mentionNodes(container, 'plain\n');
  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].textContent, 'plain\n');
});
