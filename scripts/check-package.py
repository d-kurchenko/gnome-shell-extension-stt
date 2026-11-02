"""Check that the release ZIP contains exactly the current build output."""

import argparse
import json
from pathlib import Path
import stat
import sys
from zipfile import BadZipFile, ZipFile


def check_package(package: Path, root: Path) -> None:
    metadata_bytes = (root / 'metadata.json').read_bytes()
    metadata = json.loads(metadata_bytes)
    bundle = root / 'dist' / metadata['uuid']
    expected = {
        path.relative_to(bundle).as_posix(): path
        for path in bundle.rglob('*')
        if path.is_file() and path.relative_to(bundle).as_posix() != 'schemas/gschemas.compiled'
    }
    if not expected:
        raise ValueError('Build output is missing; run bun run build first')

    required = {
        'extension.js', 'prefs.js', 'metadata.json', 'LICENSE', 'stylesheet.css',
        f"schemas/{metadata['settings-schema']}.gschema.xml",
        'resources/start.mp3', 'resources/stop.mp3',
    }
    if missing := required - set(expected):
        raise ValueError(f'Build output is incomplete: {sorted(missing)}')

    modules = {
        path.relative_to(root / 'src').with_suffix('.js').as_posix()
        for path in (root / 'src').rglob('*.ts')
        if not path.name.endswith('.d.ts')
    }
    built_modules = {name for name in expected if name.endswith('.js')}
    if modules != built_modules:
        raise ValueError(f'JavaScript modules differ from src: {sorted(modules ^ built_modules)}')
    if expected['metadata.json'].read_bytes() != metadata_bytes:
        raise ValueError('Build metadata differs from repository metadata')

    with ZipFile(package) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)):
            raise ValueError('ZIP contains duplicate paths')
        for entry in entries:
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError(f'ZIP contains a symlink: {entry.filename}')
            path = Path(entry.filename)
            if path.is_absolute() or '..' in path.parts or '\\' in entry.filename:
                raise ValueError(f'Unsafe ZIP path: {entry.filename}')

        files = {entry.filename for entry in entries if not entry.is_dir()}
        if files != set(expected):
            raise ValueError(f'ZIP differs from build: {sorted(files ^ set(expected))}')
        for name, path in expected.items():
            if archive.read(name) != path.read_bytes():
                raise ValueError(f'ZIP content differs from build: {name}')

    print(f'Package OK: {len(expected)} files, {len(modules)} JavaScript modules')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    args = parser.parse_args()
    try:
        check_package(args.package, Path(__file__).resolve().parent.parent)
    except (ValueError, OSError, KeyError, BadZipFile) as error:
        print(f'Package check failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
