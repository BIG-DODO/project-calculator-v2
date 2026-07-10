// 临时复制当前版
const fs = require('fs');
const stableCode = fs.readFileSync('退回版本/product-config-algorithm-v2_20260709_7pass4warn_stable.js', 'utf8');
fs.writeFileSync('stable-temp.js', stableCode);

const stable = require('./stable-temp.js');
const current = require('./product-config-algorithm-v2.js');

function buildInput() {
  const projectData = { landArea: 55000, far: 1.5, heightLimit: 30, ancillaryRatio: 0, rdRatio: 0 };
  const selectedProducts = new Set(['light-steel', 'split', 'layer']);
  const productOptions = {
    'light-steel': { areas: [2000, 4000] },
    split: { floors: [4], areas: [540, 800] },
    layer: { floors: [6], areas: [1000] }
  };
  return { projectData, selectedProducts, productOptions };
}

function run(mod, name) {
  const { projectData, selectedProducts, productOptions } = buildInput();
  const result = mod.calculateProductConfig(projectData, selectedProducts, productOptions);
  const totalBase = result.reduce((s, c) => s + c.base * c.count, 0);
  const totalCap = result.reduce((s, c) => s + c.unitCap * c.count, 0);
  console.log(name, 'base', totalBase, 'cap', totalCap);
  console.log(JSON.stringify(result.map(c => ({id:c.id, base:c.base, floors:c.floors, count:c.count})), null, 2));
}

run(stable, 'stable');
run(current, 'current');
