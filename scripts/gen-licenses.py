#!/usr/bin/env python3
"""Collects third-party license texts into app/src/licenses.json for the
About screen: Rust crates (cargo metadata) and production JS packages
(npm ls --omit=dev). Identical texts are stored once. Re-run after
dependency changes:  python3 scripts/gen-licenses.py
"""
import hashlib, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'app', 'src', 'licenses.json')
LICENSE_FILE = re.compile(r'^(LICEN[CS]E|COPYING|NOTICE)([-._].*)?$', re.I)

texts = {}

def add_text(text):
    text = text.replace('\r\n', '\n').strip()
    key = hashlib.sha1(text.encode()).hexdigest()[:12]
    texts.setdefault(key, text)
    return key

def license_files(directory):
    try:
        names = sorted(n for n in os.listdir(directory) if LICENSE_FILE.match(n) and os.path.isfile(os.path.join(directory, n)))
    except OSError:
        return []
    out = []
    for n in names:
        with open(os.path.join(directory, n), encoding='utf-8', errors='replace') as f:
            out.append(add_text(f.read()))
    return out

def rust():
    meta = json.loads(subprocess.check_output(
        ['cargo', 'metadata', '--format-version', '1', '--manifest-path', os.path.join(ROOT, 'core', 'Cargo.toml')]))
    members = set(meta['workspace_members'])
    pkgs = []
    for p in meta['packages']:
        if p['id'] in members:
            continue
        pkgs.append({
            'name': p['name'], 'version': p['version'], 'license': p.get('license') or 'see text',
            'repository': p.get('repository'),
            'texts': license_files(os.path.dirname(p['manifest_path'])),
        })
    return sorted(pkgs, key=lambda p: (p['name'], p['version']))

def js():
    app = os.path.join(ROOT, 'app')
    tree = json.loads(subprocess.run(['npm', 'ls', '--omit=dev', '--all', '--json'], cwd=app,
                                     capture_output=True, text=True).stdout or '{}')
    seen = {}
    def walk(deps):
        for name, info in (deps or {}).items():
            version = info.get('version')
            if version and (name, version) not in seen:
                path = os.path.join(app, 'node_modules', name)
                try:
                    with open(os.path.join(path, 'package.json')) as f:
                        pj = json.load(f)
                except OSError:
                    pj = {}
                lic = pj.get('license') or (pj.get('licenses') or [{}])[0].get('type') or 'see text'
                if isinstance(lic, dict):
                    lic = lic.get('type', 'see text')
                seen[(name, version)] = {'name': name, 'version': version, 'license': lic,
                                         'repository': (pj.get('repository') or {}).get('url') if isinstance(pj.get('repository'), dict) else pj.get('repository'),
                                         'texts': license_files(path)}
            walk(info.get('dependencies'))
    walk(tree.get('dependencies'))
    return sorted(seen.values(), key=lambda p: (p['name'], p['version']))

def lame():
    base = os.path.join(ROOT, 'core', 'vendor', 'mp3lame-sys', 'lame-3.100')
    with open(os.path.join(base, 'COPYING'), encoding='utf-8', errors='replace') as f:
        text = add_text(f.read())
    return {'name': 'LAME', 'version': '3.100', 'license': 'LGPL-2.0-or-later', 'repository': 'https://lame.sourceforge.io/',
            'texts': [text],
            'note': ('Sound Scraper uses LAME, the MP3 encoder, as a separately loaded library '
                     '(libmp3lame.0.dylib in the macOS app bundle\'s Frameworks folder; libmp3lame.dll '
                     'next to SoundScraper.exe on Windows). You may replace it with your own build of '
                     'LAME 3.100 or later. Its source is in core/vendor/mp3lame-sys/lame-3.100 of the '
                     'Sound Scraper source code.')}

data = {'lame': lame(), 'rust': rust(), 'js': js()}
data['texts'] = texts
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(data, f, indent=0, sort_keys=False)
print(f"{len(data['rust'])} Rust crates, {len(data['js'])} JS packages, {len(texts)} distinct texts, "
      f"{os.path.getsize(OUT) // 1024} KB -> {os.path.relpath(OUT, ROOT)}")
