"""Fix the generated resource icon path for this apostrophe-containing workspace."""
import os
import pathlib
import re
import subprocess
import sys
args = sys.argv[1:]
if "--input" in args:
    path = pathlib.Path(args[args.index("--input") + 1])
    body = path.read_text(encoding="utf-8")
    alias = os.environ["MM_BUILD_ALIAS"]
    body = re.sub(r'(?m)^(32512 ICON ).*$', lambda match: match.group(1) + '"' + alias + '/src-tauri/icons/icon.ico"', body)
    path.write_text(body, encoding="utf-8")
root = os.environ.get("MM_BUILD_ROOT", "")
alias = os.environ.get("MM_BUILD_ALIAS", "")
if root:
    args = [arg.replace(root, alias).replace(root.replace("\\", "/"), alias) for arg in args]
sys.exit(subprocess.run(["C:/MSYS2/ucrt64/bin/windres.exe", *args]).returncode)
