# test_fixed.py
# 修正后的Python测试

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def test_scenario(name, land_area, far, selected_products, product_options, use_enrich=False):
    density = 0.45 if far < 1.5 else (0.42 if far < 2.0 else 0.40)
    target_base = land_area * density
    target_cap = land_area * far
    
    print('='*60)
    print('TEST:', name)
    print('  S=%d, F=%.1f, Density=%.0f%%' % (land_area, far, density*100))
    print('  Target: Base=%.0f, Cap=%.0f' % (target_base, target_cap))
    print('  Products:', ', '.join(selected_products))
    if use_enrich:
        print('  Enrich: YES')
    print()
    
    # Fixed products (none for simple test)
    fixed_base = 0
    fixed_cap = 0
    
    # Factory allocation
    remaining_base = target_base - fixed_base
    remaining_cap = target_cap - fixed_cap
    
    total_base = 0
    total_cap = 0
    
    if 'split' in selected_products and 'light-steel' in selected_products:
        # Bh = Split(4), Bl = LightSteel(2.1)
        # eff_bh = 4, eff_bl = 2.1
        # But we need to solve: x + y = remaining_base, 4x + 2.1y = remaining_cap
        
        eff_bh = 4
        eff_bl = 2.1
        
        x = (remaining_cap - eff_bl * remaining_base) / (eff_bh - eff_bl)
        y = remaining_base - x
        
        split_count = max(1, round(x / 800))
        ls_count = max(1, round(y / 2000))
        
        total_base = split_count * 800 + ls_count * 2000
        total_cap = split_count * 3200 + ls_count * (2000*2+200)
        
        print('  Split: %d x 800m2 x 4F = %dm2' % (split_count, split_count*3200))
        print('  LightSteel: %d x 2000m2 = %dm2' % (ls_count, ls_count*4200))
    
    elif 'layer' in selected_products and 'tower' in selected_products:
        # Tower first (fixed)
        tower_area = product_options['tower']['areas'][0]
        rd_ratio = 0.15
        rd_cap = target_cap * rd_ratio
        tower_floors = max(3, round(rd_cap / tower_area))
        tower_cap = tower_area * tower_floors
        tower_base = tower_area
        
        print('  Tower: %d x %dm2 x %dF = %dm2' % (1, tower_area, tower_floors, tower_cap))
        
        remaining_base2 = remaining_base - tower_base
        remaining_cap2 = remaining_cap - tower_cap
        
        # Layer
        layer_opts = product_options['layer']
        floors = layer_opts['floors'][0]
        area = layer_opts['areas'][0]
        
        if use_enrich:
            # Enrich areas: add 750, 850, 900, 950
            enriched_areas = [750, 800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200]
            best_diff = float('inf')
            best_count = 0
            best_area = 0
            
            for a in enriched_areas:
                count = max(1, round(remaining_cap2 / (a * floors)))
                cap = count * a * floors
                base = count * a
                
                # Check if within density limit
                total_b = base + tower_base
                if total_b > target_base * 1.05:
                    continue
                
                far_diff = abs(cap + tower_cap - target_cap) / target_cap * 100
                if far_diff < best_diff:
                    best_diff = far_diff
                    best_count = count
                    best_area = a
            
            layer_count = best_count
            layer_area = best_area
        else:
            layer_count = max(1, round(remaining_cap2 / (area * floors)))
            layer_area = area
        
        layer_cap = layer_count * layer_area * floors
        layer_base = layer_count * layer_area
        
        total_base = tower_base + layer_base
        total_cap = tower_cap + layer_cap
        
        print('  Layer: %d x %dm2 x %dF = %dm2' % (layer_count, layer_area, floors, layer_cap))
    
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

# Scene 1: Split + LightSteel (fixed)
results.append(test_scenario(
    '1-Split+LightSteel', 20000, 1.2, ['split', 'light-steel'],
    {'split': {'floors': [4], 'areas': [800]}, 'light-steel': {'areas': [2000]}}
))

# Scene 2: Split + Layer (already works)
results.append(test_scenario(
    '2-Split+Layer', 40000, 2.0, ['split', 'layer'],
    {'split': {'floors': [4], 'areas': [800]}, 'layer': {'floors': [6], 'areas': [800]}}
))

# Scene 3: Layer + Tower WITHOUT enrich
results.append(test_scenario(
    '3-Layer+Tower (no enrich)', 30000, 3.0, ['layer', 'tower'],
    {'layer': {'floors': [8], 'areas': [1000]}, 'tower': {'areas': [2400]}},
    use_enrich=False
))

# Scene 3: Layer + Tower WITH enrich
results.append(test_scenario(
    '3-Layer+Tower (with enrich)', 30000, 3.0, ['layer', 'tower'],
    {'layer': {'floors': [8], 'areas': [1000]}, 'tower': {'areas': [2400]}},
    use_enrich=True
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
