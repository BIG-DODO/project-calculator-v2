// check-distribution.js
// 检查 11 组场景是否触发“面积段分布不均”规则

const { calculateProductConfig } = require('./product-config-algorithm-v2.js');

const testScenarios = [
  {
    name: '0-轻钢Only',
    projectData: { landArea: 45000, far: 1.0, heightLimit: 20, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['light-steel']),
    productOptions: { 'light-steel': { areas: [2000, 3000] } }
  },
  {
    name: '1-轻钢+分栋+配套楼',
    projectData: { landArea: 50000, far: 1.2, heightLimit: 30, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: new Set(['light-steel', 'split', 'support']),
    productOptions: {
      'light-steel': { areas: [1000, 3000] },
      'split': { floors: [2, 3.5], areas: [400, 670] },
      'support': { areas: [1800] }
    }
  },
  {
    name: '2-轻钢+分栋+分层',
    projectData: { landArea: 55000, far: 1.5, heightLimit: 30, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['light-steel', 'split', 'layer']),
    productOptions: {
      'light-steel': { areas: [2000, 4000] },
      'split': { floors: [4], areas: [540, 800] },
      'layer': { floors: [6], areas: [1000] }
    }
  },
  {
    name: '3-分栋+分层',
    projectData: { landArea: 62000, far: 1.8, heightLimit: 40, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer']),
    productOptions: {
      'split': { floors: [3.5, 4], areas: [540, 670, 800] },
      'layer': { floors: [6, 8], areas: [600, 1000] }
    }
  },
  {
    name: '4-分栋+分层+配套楼',
    projectData: { landArea: 42500, far: 2.0, heightLimit: 40, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer', 'support']),
    productOptions: {
      'split': { floors: [4], areas: [540, 800] },
      'layer': { floors: [8], areas: [800, 1000] },
      'support': { areas: [2400] }
    }
  },
  {
    name: '5-分栋+分层',
    projectData: { landArea: 66000, far: 2.2, heightLimit: 40, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer']),
    productOptions: {
      'split': { floors: [3.5, 4], areas: [670, 800] },
      'layer': { floors: [6, 8], areas: [800, 1000, 1200] }
    }
  },
  {
    name: '6-分栋+分层',
    projectData: { landArea: 36000, far: 2.5, heightLimit: 50, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer']),
    productOptions: {
      'split': { floors: [3.5, 4], areas: [540, 800] },
      'layer': { floors: [8], areas: [1000, 1200] }
    }
  },
  {
    name: '7-分栋+分层+配套楼+配套宿舍',
    projectData: { landArea: 18900, far: 3.0, heightLimit: 50, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer', 'support', 'dorm']),
    productOptions: {
      'split': { floors: [4], areas: [670, 800] },
      'layer': { floors: [10], areas: [600, 1000] },
      'support': { areas: [1200] }
    }
  },
  {
    name: '8-分栋+分层+产业大厦+配套楼+配套宿舍',
    projectData: { landArea: 48000, far: 3.0, heightLimit: 60, ancillaryRatio: 0.05, rdRatio: 0.15 },
    selectedProducts: new Set(['split', 'layer', 'tower', 'support', 'dorm']),
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [8, 10], areas: [800, 1200] },
      'tower': { areas: [1800] },
      'support': { areas: [1500] }
    }
  },
  {
    name: '9-分层+产业大厦+配套楼+配套宿舍',
    projectData: { landArea: 60000, far: 3.5, heightLimit: 60, ancillaryRatio: 0.10, rdRatio: 0.15 },
    selectedProducts: new Set(['layer', 'tower', 'support', 'dorm']),
    productOptions: {
      'layer': { floors: [6, 8], areas: [600, 800] },
      'tower': { areas: [2400] },
      'support': { areas: [1800] }
    }
  },
  {
    name: '10-分层+产业大厦+配套楼+配套宿舍',
    projectData: { landArea: 35000, far: 4.0, heightLimit: 80, ancillaryRatio: 0.15, rdRatio: 0.15 },
    selectedProducts: new Set(['layer', 'tower', 'support', 'dorm']),
    productOptions: {
      'layer': { floors: [10, 12], areas: [1000, 1200] },
      'tower': { areas: [2000] },
      'support': { areas: [2400] }
    }
  }
];

function checkDistribution(result) {
  const groups = {};
  for (const item of result) {
    // 仅检查厂房类型
    if (!['light-steel', 'split', 'layer'].includes(item.id)) continue;
    const key = `${item.id}_${item.floors}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ base: item.base, count: item.count, type: item.type, floors: item.floors });
  }

  const violations = [];
  for (const [key, items] of Object.entries(groups)) {
    const total = items.reduce((s, x) => s + x.count, 0);
    // 需要至少两个不同面积段才存在“分布不均”
    if (total < 5 || items.length < 2) continue;
    for (const item of items) {
      const others = total - item.count;
      if (item.count > others * 2) {
        violations.push({
          key,
          type: items[0].type,
          floors: items[0].floors,
          base: item.base,
          count: item.count,
          others,
          total
        });
      }
    }
  }
  return violations;
}

console.log('面积段分布不均检查（规则：同一类型+同层数总栋数≥5，且某面积段栋数 > 其余面积段栋数之和 × 2）');
console.log('='.repeat(90));

for (const scenario of testScenarios) {
  const landArea = scenario.projectData.landArea;
  const far = scenario.projectData.far;
  const ancillaryRatio = scenario.projectData.ancillaryRatio || 0;
  const targetAncillaryArea = landArea * far * ancillaryRatio;
  if (targetAncillaryArea > 2400) {
    scenario.selectedProducts.add('dorm');
    if (!scenario.productOptions['dorm']) {
      scenario.productOptions['dorm'] = { areas: [800, 1000, 1200] };
    }
  }

  const result = calculateProductConfig(scenario.projectData, scenario.selectedProducts, scenario.productOptions);
  const violations = checkDistribution(result);

  console.log(`\n场景：${scenario.name}`);
  if (violations.length === 0) {
    console.log('  结果：未触发分布不均规则');
  } else {
    console.log('  结果：⚠ 触发分布不均规则');
    for (const v of violations) {
      console.log(`    • ${v.type} ${v.floors}F(${v.base})：${v.count} 栋，其余面积段共 ${v.others} 栋，总计 ${v.total} 栋`);
      console.log(`      判断：${v.count} > ${v.others} × 2 = ${v.others * 2}，成立`);
    }
  }
}
