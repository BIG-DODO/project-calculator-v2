// test-scenarios2.js
// 基于测试场景2.xlsx 自动生成

const algorithm = require('./product-config-algorithm-v2.js');
const calculateProductConfig = algorithm.calculateProductConfig;

const testScenarios = [
  {
    name: '场景11',
    projectData: { landArea: 78067, far: 1.3, heightLimit: 30, ancillaryRatio: 0.0, rdRatio: 0.0 },
    selectedProducts: new Set(['split', 'layer']),
    productOptions: {
      'split': { floors: [2, 3], areas: [400, 540, 670] },
      'layer': { floors: [5], areas: [600, 800] }
    }
  },
  {
    name: '场景22',
    projectData: { landArea: 39208, far: 4.0, heightLimit: 100, ancillaryRatio: 0.0, rdRatio: 0.0 },
    selectedProducts: new Set(['split', 'layer']),
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [12], areas: [1000, 1200] }
    }
  },
  {
    name: '场景33',
    projectData: { landArea: 84440, far: 1.5, heightLimit: 40, ancillaryRatio: 0.012, rdRatio: 0.0 },
    selectedProducts: new Set(['split', 'layer', 'support']),
    productOptions: {
      'split': { floors: [3.5], areas: [540, 670, 800] },
      'layer': { floors: [6], areas: [600, 1000] },
      'support': { areas: [1500] }
    }
  },
  {
    name: '场景44',
    projectData: { landArea: 37215, far: 3.0, heightLimit: 50, ancillaryRatio: 0.0, rdRatio: 0.235 },
    selectedProducts: new Set(['split', 'layer', 'tower']),
    productOptions: {
      'split': { floors: [4], areas: [800, 1000] },
      'layer': { floors: [7, 8], areas: [800, 1000, 1200] },
      'tower': { areas: [2400] }
    }
  },
  {
    name: '场景55',
    projectData: { landArea: 55738, far: 2.31, heightLimit: 150, ancillaryRatio: 0.014, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer', 'support']),
    productOptions: {
      'split': { floors: [4], areas: [670, 800] },
      'layer': { floors: [6, 10], areas: [600, 800, 1000] },
      'support': { areas: [1800] }
    }
  },
  {
    name: '场景66',
    projectData: { landArea: 43540, far: 3.5, heightLimit: 100, ancillaryRatio: 0.012, rdRatio: 0.315 },
    selectedProducts: new Set(['split', 'layer', 'tower', 'support']),
    productOptions: {
      'split': { floors: [4], areas: [670, 800] },
      'layer': { floors: [12], areas: [1000, 1200] },
      'tower': { areas: [2400] },
      'support': { areas: [1800] }
    }
  },
  {
    name: '场景77',
    projectData: { landArea: 45840, far: 1.1, heightLimit: 30, ancillaryRatio: 0, rdRatio: 0 },
    selectedProducts: new Set(['light-steel', 'split']),
    productOptions: {
      'light-steel': { areas: [1500] },
      'split': { floors: [2], areas: [540, 670] }
    }
  },
  {
    name: '场景88',
    projectData: { landArea: 42760, far: 2.25, heightLimit: 40, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer', 'dorm']),
    productOptions: {
      'split': { floors: [4], areas: [670, 800] },
      'layer': { floors: [6], areas: [800, 1000] }
    }
  },
  {
    name: '场景99',
    projectData: { landArea: 20668, far: 2.12, heightLimit: 150, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer', 'dorm']),
    productOptions: {
      'split': { floors: [3.5], areas: [670, 800] },
      'layer': { floors: [8], areas: [1000, 1200] }
    }
  },
  {
    name: '场景110',
    projectData: { landArea: 20668, far: 2.5, heightLimit: 150, ancillaryRatio: 0.15, rdRatio: 0 },
    selectedProducts: new Set(['split', 'layer', 'dorm']),
    productOptions: {
      'split': { floors: [4], areas: [670, 800] },
      'layer': { floors: [8], areas: [1000, 1200] }
    }
  }
];

function runTests(testScenarios, label) {
  console.log('='.repeat(70));
  console.log(label);
  console.log('='.repeat(70));
  console.log('');

  const results = [];

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

    const density = far < 1.5 ? 0.45 : (far < 2.0 ? 0.42 : 0.40);
    const targetBase = landArea * density;
    const targetCap = landArea * far;

    console.log('TEST:', scenario.name);
    console.log('Params: S=%d, F=%.2f, Hl=%d, R2=%.3f, R1=%.3f',
      landArea, far, scenario.projectData.heightLimit,
      scenario.projectData.ancillaryRatio, scenario.projectData.rdRatio);
    console.log('Products:', Array.from(scenario.selectedProducts).join(', '));
    console.log('');

    try {
      const result = calculateProductConfig(scenario.projectData, scenario.selectedProducts, scenario.productOptions);
      if (result.error) throw new Error(result.error);

      const products = result.products;
      const totalBase = result.totalBase;
      const totalCap = result.totalCap;
      const totalCount = result.totalCount;

      const actualDensity = totalBase / landArea;
      const actualFar = totalCap / landArea;
      const densityDiff = Math.abs(actualDensity - density) / density * 100;
      const farDiff = Math.abs(actualFar - far) / far * 100;

      console.log('RESULT:');
      console.log('  Total Base: %d m2 (target %d)', Math.round(totalBase), Math.round(targetBase));
      console.log('  Total Cap: %d m2 (target %d)', Math.round(totalCap), Math.round(targetCap));
      console.log('  Total Count: %d', totalCount);
      console.log('  Density: %.2f%% (target %.2f%%) diff=%.2f%%',
        actualDensity * 100, density * 100, densityDiff);
      console.log('  FAR: %.4f (target %.4f) diff=%.4f%%',
        actualFar, far, farDiff);
      console.log('');

      if (products.length > 0) {
        console.log('  Products:');
        products.forEach((p, i) => {
          console.log('    %d. %s %s', i+1, p.type, p.productType || '');
          console.log('       Base: %d, UnitCap: %d, Count: %d, TotalCap: %d',
            p.base, p.unitCap, p.count, p.totalCap);
        });
      }

      results.push({
        name: scenario.name,
        success: true,
        densityDiff,
        farDiff,
        totalBase: Math.round(totalBase),
        totalCap: Math.round(totalCap),
        products
      });

    } catch (err) {
      console.error('ERROR:', err.message);
      console.error(err.stack);

      results.push({
        name: scenario.name,
        success: false,
        error: err.message
      });
    }

    console.log('');
    console.log('-'.repeat(70));
    console.log('');
  }

  console.log('='.repeat(70));
  console.log(label + ' - SUMMARY');
  console.log('='.repeat(70));
  console.log('');

  let passCount = 0;
  let warnCount = 0;

  for (const r of results) {
    if (!r.success) {
      console.log('FAIL: %s - %s', r.name, r.error);
      warnCount++;
    } else if (r.densityDiff > 5 || r.farDiff > 0.5) {
      console.log('WARN: %s - Density=%.2f%%, FAR=%.2f%%', r.name, r.densityDiff, r.farDiff);
      warnCount++;
    } else {
      console.log('PASS: %s - Density=%.2f%%, FAR=%.2f%%', r.name, r.densityDiff, r.farDiff);
      passCount++;
    }
  }

  console.log('');
  console.log('Total: %d passed, %d failed/warned', passCount, warnCount);
  console.log('');
  console.log('='.repeat(70));

  return results;
}

const results = runTests(testScenarios, '测试场景2 - 完整版算法测试');

module.exports = { results };
