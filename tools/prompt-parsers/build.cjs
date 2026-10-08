const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const out = path.resolve(__dirname, '../../web/h3/vendor');
fs.mkdirSync(out, {recursive: true});
require('esbuild').buildSync({
  entryPoints: [path.join(__dirname, 'entry.js')], bundle: true, minify: true,
  platform: 'browser', format: 'iife', globalName: 'H3PromptParsers', target: 'es2020',
  outfile: path.join(out, 'prompt-parsers.js'), legalComments: 'inline',
  footer: {js: "if(typeof module==='object'&&module.exports)module.exports=H3PromptParsers;"},
});
const licenses = ['jsonc-parser', 'yaml'].map(name => {
  const root = path.join(__dirname, 'node_modules', name);
  const pkg = require(path.join(root, 'package.json'));
  const file = fs.readdirSync(root).find(f => /^license/i.test(f));
  return `${name}@${pkg.version}\n${fs.readFileSync(path.join(root,file),'utf8')}`;
});
fs.writeFileSync(path.join(out, 'LICENSES.txt'), licenses.join('\n\n---\n\n'));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
  packages: require('./package.json').dependencies,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'prompt-parsers.js'))).digest('hex'),
  rebuild: 'npm ci --prefix tools/prompt-parsers && npm run build --prefix tools/prompt-parsers',
}, null, 2)+'\n');
