import json
from pathlib import Path

CATS = ['SaaS', '디자인/기획', '핀테크', '웹사이트', 'AI', '커머스', '클라우드', '모바일', '유지보수']

for path in [Path('frontend/src/data/erd/projects.json'),
             Path('frontend/src/data/erd/partner_profile.json')]:
    data = json.loads(path.read_text(encoding='utf-8'))
    count = 0
    for i, item in enumerate(data):
        if 'service_field' in item:
            item['service_field'] = CATS[i % len(CATS)]
            count += 1
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'updated {path} (items={len(data)}, fields_set={count})')

# 분포 확인
for path in [Path('frontend/src/data/erd/projects.json'),
             Path('frontend/src/data/erd/partner_profile.json')]:
    data = json.loads(path.read_text(encoding='utf-8'))
    from collections import Counter
    c = Counter(item.get('service_field') for item in data if 'service_field' in item)
    print(f'\n{path.name} distribution:')
    for k, v in c.most_common():
        print(f'  {k}: {v}')
