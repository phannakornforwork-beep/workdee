# Temporary: post captured output as a check run so it can be read through the GitHub API.
# usage: python3 report.py NAME FILE[:BYTES] [FILE[:BYTES] ...]
import json, os, subprocess, sys

name, specs = sys.argv[1], sys.argv[2:]
parts = []
for spec in specs:
    path, _, budget = spec.partition(':')
    budget = int(budget or 20000)
    try:
        data = open(path, 'rb').read()
    except OSError as e:
        data = f'({e})'.encode()
    if len(data) > budget:
        data = b'...(truncated)...\n' + data[-budget:]
    parts.append(f'===== {path} =====\n'.encode() + data)
text = b'\n'.join(parts)[-60000:].decode('utf-8', 'replace')
payload = {
    'name': name, 'head_sha': os.environ['GITHUB_SHA'], 'status': 'completed', 'conclusion': 'neutral',
    'output': {'title': name, 'summary': 'captured output', 'text': text},
}
subprocess.run(['gh', 'api', f"repos/{os.environ['GITHUB_REPOSITORY']}/check-runs", '--input', '-'],
               input=json.dumps(payload).encode(), check=True, stdout=subprocess.DEVNULL)
