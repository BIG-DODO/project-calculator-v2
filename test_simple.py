# test_simple.py
# 简化版Python测试，验证核心算法逻辑

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def test_scenario(name, land_area, far, selected_products, product_options):
    density = 0.45 if far < 1.5 else (0.42 if far < 2.0 else 0.40)
    target_base = land_area * density
    target_cap = land_area * far
    
    print('='*60)
    print('TEST:', name)
    print('  S=%d, F=%.1f, Density=%.0f%%' % (land_area, far, density*100))
    print('  Target: Base=%.0f, Cap=%.0f' % (target_base, target_cap))
    print('  Products:', ', '.join(selected_products))
    print()
    
    # Fixed products (none for simple test)
    fixed_base = 0
    fixed_cap = 0
    
    # Factory allocation
    remaining_base = target_base - fixed_base
    remaining_cap = target_cap - fixed_cap
    
    # Bh/Bl allocation (simplified)
    total_base = 0
    total_cap = 0
    
    if 'split' in selected_products and 'layer' in selected_products:
        # Bh = Layer(6), Bl = Split(4)
        eff_bh = 6
        eff_bl = 4
        
        x = (remaining_cap - eff_bl * remaining_base) / (eff_bh - eff_bl)
        y = remaining_base - x
        
        layer_count = max(1, round(x / 800))
        split_count = max(1, round(y / 800))
        
        total_base = layer_count * 800 + split_count * 800
        total_cap = layer_count * 4800 + split_count * 3200
        
        print('  Layer: %d x 800m2 x 6F = %dm2' % (layer_count, layer_count*4800))
        print('  Split: %d x 800m2 x 4F = %dm2' % (split_count, split_count*3200))
    
    elif 'split' in selected_products:
        # Only split
        split_opts = product_options['split']
        floors = split_opts['floors'][0]
        area = split_opts['areas'][0]
        count = max(1, round(remaining_cap / (area * floors)))
        
        total_base = count * area
        total_cap = count * area * floors
        
        print('  Split: %d x %dm2 x %dF = %dm2' % (count, area, floors, total_cap))
    
    elif 'layer' in selected_products:
        # Only layer
        layer_opts = product_options['layer']
        floors = layer_opts['floors'][0]
        area = layer_opts['areas'][0]
        count = max(1, round(remaining_cap / (area * floors)))
        
        total_base = count * area
        total_cap = count * area * floors
        
        print('  Layer: %d x %dm2 x %dF = %dm2' % (count, area, floors, total_cap))
    
    actual_density = total_base / land_area
    actual_far = total_cap / land_area
    density_diff = abs(actual_density - density) / density * 100
    far_diff = abs(actual_far - far) / far * 100
    
    print()
    print('  Total Base: %d, Total Cap: %d' % (total_base, total_cap))
    print('  Density: %.2f%% (diff=%.2f%%)' % (actual_density*100, density_diff))
    print('  FAR: %.4f (diff=%.4f%%)' % (actual_far, far_diff))
    print()
    
    if density_diff > 5:
        print('  ERROR: Density deviation > 5%!')
    if far_diff > 0.01:
        print('  WARN: FAR deviation > 0.01%')
    
    return {
        'name': name,
        'densityDiff': density_diff,
        'farDiff': far_diff,
        'success': density_diff <= 5 and far_diff <= 0.01
    }

# Run tests
results = []

results.append(test_scenario(
    '1-SingleSplit', 20000, 1.2, ['split'],
    {'split': {'floors': [4], 'areas': [800]}}
))

results.append(test_scenario(
    '2-Split+Layer', 40000, 2.0, ['split', 'layer'],
    {'split': {'floors': [4], 'areas': [800]}, 'layer': {'floors': [6], 'areas': [800]}}
))

results.append(test_scenario(
    '3-HighFAR', 30000, 3.0, ['layer', 'tower'],
    {'layer': {'floors': [8], 'areas': [1000]}, 'tower': {'areas': [2400]}}
))

# Summary
print('='*60)
print('SUMMARY')
print('='*60)
print()

pass_count = sum(1 for r in results if r['success'])
fail_count = len(results) - pass_count

for r in results:
    status = 'PASS' if r['success'] else 'FAIL'
    print('%s: %s - Density=%.2f%%, FAR=%.4f%%' % (status, r['name'], r['densityDiff'], r['farDiff']))

print()
print('Total: %d passed, %d failed' % (pass_count, fail_count))
print()
print('='*60)
