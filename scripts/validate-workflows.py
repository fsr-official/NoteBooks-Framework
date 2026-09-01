from pathlib import Path

try:
    import yaml
except Exception as exc:
    raise SystemExit(f'PyYAML unavailable: {exc}')

workflow_dir = Path('.github/workflows')
paths = sorted(workflow_dir.iterdir())
for path in paths:
    with path.open(encoding='utf-8') as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict) or 'name' not in data or 'jobs' not in data:
        raise SystemExit(f'invalid workflow structure: {path}')
    print(f'{path}: valid YAML')
print(f'validated {len(paths)} workflow files')
