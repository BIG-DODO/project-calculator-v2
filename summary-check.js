const algorithm = require('./product-config-algorithm-v2.js');
const calculateProductConfig = algorithm.calculateProductConfig;

function checkDistribution(counts, configs) {
  const groups = {};
  for (let i = 0; i < configs.length; i++) {
    if (counts[i] > 0) {
      const id = configs[i].id;
      if (!['light-steel', 'split', 'layer'].includes(id)) continue;
      const key = `${id}_${configs[i].floors}`;
      if (!groups[key]) {
        groups[key] = { id, floor: configs[i].floors, indices: [], totalCount: 0 };
      }
      groups[key].indices.push(i);
      groups[key].totalCount += counts[i];
    }
  }
  const triggers = [];
  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (group.totalCount < 5) continue;
    if (group.indices.length < 2) continue;
    for (const idx of group.indices) {
      const areaCount = counts[idx];
      const rest = group.totalCount - areaCount;
      if (areaCount > rest * 2) {
        triggers.push({
          key, type: group.id, floor: group.floor,
          base: configs[idx].base, count: areaCount, rest
        });
      }
    }
  }
  return triggers;
}

function runScenario(s) {
  const landArea = s.projectData.landArea;
  const far = s.projectData.far;
  const ancillaryRatio = s.projectData.ancillaryRatio || 0;
  const targetAncillaryArea = landArea * far * ancillaryRatio;
  if (targetAncillaryArea > 2400) {
    s.selectedProducts.add('dorm');
    if (!s.productOptions['dorm']) s.productOptions['dorm'] = { areas: [800, 1000, 1200] };
  }
  const density = far < 1.5 ? 0.45 : (far < 2.0 ? 0.42 : 0.40);
  const targetBase = landArea * density;
  const targetCap = landArea * far;

  try {
    const result = calculateProductConfig(s.projectData, s.selectedProducts, s.productOptions);
    if (result.error) throw new Error(result.error);
    const products = result.products;
    let totalBase = 0, totalCap = 0;
    const configs = [];
    const counts = [];
    for (const item of products) {
      totalBase += item.base * item.count;
      totalCap += item.unitCap * item.count;
      configs.push(item);
      counts.push(item.count);
    }
    const triggers = checkDistribution(counts, configs);
    const densityDiff = Math.abs(totalBase/landArea - density) / density * 100;
    const farDiff = Math.abs(totalCap/landArea - far) / far * 100;
    return { name: s.name, densityDiff, farDiff, triggers, totalBase, totalCap, targetBase, targetCap };
  } catch (err) {
    return { name: s.name, error: err.message };
  }
}

function printSummary(title, scenarios) {
  console.log('='.repeat(90));
  console.log(title);
  console.log('='.repeat(90));
  console.log('场景, 密度偏差%, 容积率偏差%, 分布触发, 备注');
  for (const s of scenarios) {
    const r = runScenario(s);
    if (r.error) {
      console.log(`${r.name}, ERROR, ${r.error}`);
    } else {
      const distStr = r.triggers.length > 0
        ? `YES(${r.triggers.map(t => `${t.type}${t.floor}F base=${t.base} count=${t.count}`).join('; ')})`
        : 'NO';
      const note = (r.densityDiff > 5 || r.farDiff > 0.5) ? 'WARN' : 'PASS';
      console.log(`${r.name}, ${r.densityDiff.toFixed(2)}, ${r.farDiff.toFixed(4)}, ${distStr}, ${note}`);
    }
  }
  console.log('');
}

const scenarios1 = [
  { name: '0-轻钢Only', projectData: { landArea: 45000, far: 1.0, heightLimit: 20, ancillaryRatio: 0, rdRatio: 0 }, selectedProducts: new Set(['light-steel']), productOptions: { 'light-steel': { areas: [2000, 3000] } } },
  { name: '1-轻钢+分栋+配套楼', projectData: { landArea: 50000, far: 1.2, heightLimit: 30, ancillaryRatio: 0.15, rdRatio: 0 }, selectedProducts: new Set(['light-steel', 'split', 'support']), productOptions: { 'light-steel': { areas: [1000, 3000] }, 'split': { floors: [2, 3.5], areas: [400, 670] }, 'support': { areas: [1800] } } },
  { name: '2-轻钢+分栋+分层', projectData: { landArea: 55000, far: 1.5, heightLimit: 30, ancillaryRatio: 0, rdRatio: 0 }, selectedProducts: new Set(['light-steel', 'split', 'layer']), productOptions: { 'light-steel': { areas: [2000, 4000] }, 'split': { floors: [4], areas: [540, 800] }, 'layer': { floors: [6], areas: [1000] } } },
  { name: '3-分栋+分层', projectData: { landArea: 62000, far: 1.8, heightLimit: 40, ancillaryRatio: 0, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer']), productOptions: { 'split': { floors: [3.5, 4], areas: [540, 670, 800] }, 'layer': { floors: [6, 8], areas: [600, 1000] } } },
  { name: '4-分栋+分层+配套楼', projectData: { landArea: 42500, far: 2.0, heightLimit: 40, ancillaryRatio: 0.15, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer', 'support']), productOptions: { 'split': { floors: [4], areas: [540, 800] }, 'layer': { floors: [8], areas: [800, 1000] }, 'support': { areas: [2400] } } },
  { name: '5-分栋+分层', projectData: { landArea: 66000, far: 2.2, heightLimit: 40, ancillaryRatio: 0, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer']), productOptions: { 'split': { floors: [3.5, 4], areas: [670, 800] }, 'layer': { floors: [6, 8], areas: [800, 1000, 1200] } } },
  { name: '6-分栋+分层', projectData: { landArea: 36000, far: 2.5, heightLimit: 50, ancillaryRatio: 0, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer']), productOptions: { 'split': { floors: [3.5, 4], areas: [540, 800] }, 'layer': { floors: [8], areas: [1000, 1200] } } },
  { name: '7-分栋+分层+配套楼+配套宿舍', projectData: { landArea: 18900, far: 3.0, heightLimit: 50, ancillaryRatio: 0.15, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer', 'support', 'dorm']), productOptions: { 'split': { floors: [4], areas: [670, 800] }, 'layer': { floors: [10], areas: [600, 1000] }, 'support': { areas: [1200] } } },
  { name: '8-分栋+分层+产业大厦+配套楼+配套宿舍', projectData: { landArea: 48000, far: 3.0, heightLimit: 60, ancillaryRatio: 0.05, rdRatio: 0.15 }, selectedProducts: new Set(['split', 'layer', 'tower', 'support', 'dorm']), productOptions: { 'split': { floors: [4], areas: [800, 1000] }, 'layer': { floors: [8, 10], areas: [800, 1200] }, 'tower': { areas: [1800] }, 'support': { areas: [1500] } } },
  { name: '9-分层+产业大厦+配套楼+配套宿舍', projectData: { landArea: 60000, far: 3.5, heightLimit: 60, ancillaryRatio: 0.10, rdRatio: 0.15 }, selectedProducts: new Set(['layer', 'tower', 'support', 'dorm']), productOptions: { 'layer': { floors: [6, 8], areas: [600, 800] }, 'tower': { areas: [2400] }, 'support': { areas: [1800] } } },
  { name: '10-分层+产业大厦+配套楼+配套宿舍', projectData: { landArea: 35000, far: 4.0, heightLimit: 80, ancillaryRatio: 0.15, rdRatio: 0.15 }, selectedProducts: new Set(['layer', 'tower', 'support', 'dorm']), productOptions: { 'layer': { floors: [10, 12], areas: [1000, 1200] }, 'tower': { areas: [2000] }, 'support': { areas: [2400] } } }
];

const scenarios2 = [
  { name: '场景11', projectData: { landArea: 78067, far: 1.3, heightLimit: 30, ancillaryRatio: 0, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer']), productOptions: { 'split': { floors: [2, 3], areas: [400, 540, 670] }, 'layer': { floors: [5], areas: [600, 800] } } },
  { name: '场景22', projectData: { landArea: 39208, far: 4.0, heightLimit: 100, ancillaryRatio: 0, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer']), productOptions: { 'split': { floors: [4], areas: [800, 1000] }, 'layer': { floors: [12], areas: [1000, 1200] } } },
  { name: '场景33', projectData: { landArea: 84440, far: 1.5, heightLimit: 40, ancillaryRatio: 0.012, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer', 'support']), productOptions: { 'split': { floors: [3.5], areas: [540, 670, 800] }, 'layer': { floors: [6], areas: [600, 1000] }, 'support': { areas: [1500] } } },
  { name: '场景44', projectData: { landArea: 37215, far: 3.0, heightLimit: 50, ancillaryRatio: 0, rdRatio: 0.235 }, selectedProducts: new Set(['split', 'layer', 'tower']), productOptions: { 'split': { floors: [4], areas: [800, 1000] }, 'layer': { floors: [7, 8], areas: [800, 1000, 1200] }, 'tower': { areas: [2400] } } },
  { name: '场景55', projectData: { landArea: 55738, far: 2.31, heightLimit: 150, ancillaryRatio: 0.014, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer', 'support']), productOptions: { 'split': { floors: [4], areas: [670, 800] }, 'layer': { floors: [6, 10], areas: [600, 800, 1000] }, 'support': { areas: [1800] } } },
  { name: '场景66', projectData: { landArea: 43540, far: 3.5, heightLimit: 100, ancillaryRatio: 0.012, rdRatio: 0.315 }, selectedProducts: new Set(['split', 'layer', 'tower', 'support']), productOptions: { 'split': { floors: [4], areas: [670, 800] }, 'layer': { floors: [12], areas: [1000, 1200] }, 'tower': { areas: [2400] }, 'support': { areas: [1800] } } },
  { name: '场景77', projectData: { landArea: 45840, far: 1.1, heightLimit: 30, ancillaryRatio: 0, rdRatio: 0 }, selectedProducts: new Set(['light-steel', 'split']), productOptions: { 'light-steel': { areas: [1500] }, 'split': { floors: [2], areas: [540, 670] } } },
  { name: '场景88', projectData: { landArea: 42760, far: 2.25, heightLimit: 40, ancillaryRatio: 0.15, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer', 'dorm']), productOptions: { 'split': { floors: [4], areas: [670, 800] }, 'layer': { floors: [6], areas: [800, 1000] } } },
  { name: '场景99', projectData: { landArea: 20668, far: 2.12, heightLimit: 150, ancillaryRatio: 0.15, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer', 'dorm']), productOptions: { 'split': { floors: [3.5], areas: [670, 800] }, 'layer': { floors: [8], areas: [1000, 1200] } } },
  { name: '场景110', projectData: { landArea: 20668, far: 2.5, heightLimit: 150, ancillaryRatio: 0.15, rdRatio: 0 }, selectedProducts: new Set(['split', 'layer', 'dorm']), productOptions: { 'split': { floors: [4], areas: [670, 800] }, 'layer': { floors: [8], areas: [1000, 1200] } } }
];

printSummary('11种原始场景汇总', scenarios1);
printSummary('新场景2汇总', scenarios2);
