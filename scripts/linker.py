"""Normalize workspace paths in GNU linker response files on Windows.

Rust canonicalizes SUBST paths. GNU response files cannot round-trip the apostrophe
in this workspace name. Replace only our known workspace prefix with its alias.
"""
import os
import pathlib
import subprocess
import sys

root = os.environ['MM_BUILD_ROOT']
alias = os.environ['MM_BUILD_ALIAS']
def normalize(value):
    for prefix in (root.replace('\\', '\\\\').replace(' ', '\\ '), root.replace('\\', '/').replace(' ', '\\ '), root, root.replace('\\', '/'), root.replace('\\', '\\\\')):
        value = value.replace(prefix, alias)
    return value
args = []
for arg in sys.argv[1:]:
    if arg.startswith('@'):
        path = pathlib.Path(arg[1:])
        raw = path.read_bytes()
        encoding = 'utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8'
        fixed = path.with_suffix(path.suffix + '.fixed')
        body = raw.decode(encoding)
        fixed.write_text(normalize(body), encoding=encoding)
        args.append('@' + str(fixed))
    else:
        args.append(normalize(arg))
sys.exit(subprocess.run([os.environ['MM_LINKER'], *args]).returncode)
