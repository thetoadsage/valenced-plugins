#!/usr/bin/env python3
"""Import reviewed rules and generate a Swift reference corpus from a local checkout.

Usage: python3 scripts/sync-url-cleaner.py /path/to/clipboard-cleaner
Review the diff; run tests before publishing a new plugin version.
"""
import json
import pathlib
import re
import subprocess
import sys
import tempfile

source = pathlib.Path(sys.argv[1]).resolve()
root = pathlib.Path(__file__).resolve().parents[1]
core = source / 'Sources/ClipboardCleanerCore'
plugin = root / 'plugins/url-cleaner'
rules = json.loads((core / 'Resources/tracking-rules.json').read_text())
(plugin / 'js/tracking-rules.json').write_text(json.dumps(rules, indent='\t', ensure_ascii=False)+'\n')
inputs = set()
for test in (source / 'Tests/ClipboardCleanerCoreTests').glob('*.swift'):
    if test.stem in {'HistoryStoreTests', 'StatisticsStoreTests', 'TrackingRuleCatalogTests'}:
        continue
    for match in re.finditer(r'"((?:https?|ftp|file)://(?:[^"\\]|\\.)*)"', test.read_text()):
        literal = match[1]
        if r'\(' in literal:
            continue
        literal = re.sub(r'\\u\{([0-9a-fA-F]+)\}', lambda m: chr(int(m[1], 16)), literal)
        try:
            inputs.add(json.loads('"' + literal + '"'))
        except ValueError:
            continue
with tempfile.TemporaryDirectory(prefix='url-cleaner-reference-') as tmp:
    tmp = pathlib.Path(tmp)
    files = []
    for name in ['URLCleaner', 'TrackingRuleCatalog', 'RedirectUnwrapper', 'CanonicalURLRules', 'HostMatching']:
        content = (core / f'{name}.swift').read_text()
        if name == 'TrackingRuleCatalog':
            content = content.replace('if let url = resourceURL(),', f'if let url = Optional(URL(fileURLWithPath: {json.dumps(str(core / "Resources/tracking-rules.json"))})),')
        path = tmp / f'{name}.swift'
        path.write_text(content)
        files.append(str(path))
    main = tmp / 'main.swift'
    main.write_text('''import Foundation
while let line = readLine() {
    let input = try! JSONDecoder().decode(String.self, from: Data(line.utf8))
    let output = URLCleaner.clean(input)
    print(String(data: try! JSONEncoder().encode(output), encoding: .utf8)!)
}
''')
    executable = tmp / 'reference'
    subprocess.run(['swiftc', '-module-cache-path', str(tmp / 'ModuleCache'), '-o', str(executable), *files, str(main)], check=True)
    ordered = sorted(inputs)
    results = subprocess.run([str(executable)], input='\n'.join(json.dumps(url) for url in ordered)+'\n', text=True, capture_output=True, check=True)
    expected = [json.loads(line) for line in results.stdout.splitlines()]
    assert len(expected) == len(ordered)
    fixture = [{'input': url, 'expected': result} for url, result in zip(ordered, expected)]
    (root / 'tests/fixtures/clipboard-cleaner.json').write_text(json.dumps(fixture, indent='\t', ensure_ascii=False)+'\n')
    print(f'Imported catalog and {len(fixture)} Swift reference cases')
