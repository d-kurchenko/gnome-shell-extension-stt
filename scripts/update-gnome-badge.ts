function formatVersions(versions: string[]): string
{
    const sorted = [...new Set(versions)].sort((a, b) =>
        a.localeCompare(b, 'en', {numeric: true})
    );
    const ranges: string[][] = [];
    for (const version of sorted) {
        const range = ranges.at(-1);
        if (range && Number.isInteger(Number(version)) && Number(version) === Number(range.at(-1)) + 1)
            range.push(version);
        else
            ranges.push([version]);
    }

    return ranges.map(range => range.length === 1
        ? range[0] : `${range[0]}–${range.at(-1)}`).join(', ');
}

export async function updateGnomeBadge(): Promise<void>
{
    const metadata = await Bun.file(new URL('../metadata.json', import.meta.url)).json();
    const versions = metadata['shell-version'];
    if (!Array.isArray(versions) || !versions.length || !versions.every(version =>
        typeof version === 'string' && /^\d+(?:\.\d+)*$/.test(version)
    ))
        throw new Error('metadata.json: shell-version must contain numeric version strings.');

    const label = formatVersions(versions);
    const width = 140 + label.length * 8;
    const svg = `<!-- Generated from metadata.json by scripts/update-gnome-badge.ts. -->
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="44" viewBox="0 0 ${width} 44" role="img" aria-labelledby="title">
  <title id="title">GNOME Shell ${label}</title>
  <rect x=".5" y=".5" width="${width - 1}" height="43" rx="10" fill="#f1f4f6" stroke="#cbd5dc"/>
  <text x="14" y="27" fill="#243541" font-family="Cantarell, system-ui, sans-serif" font-size="14" font-weight="600">GNOME Shell</text>
  <path d="M112 13v18" stroke="#cbd5dc"/>
  <text x="125" y="27" fill="#243541" font-family="Cantarell, system-ui, sans-serif" font-size="14" font-weight="700">${label}</text>
</svg>
`;
    const badge = Bun.file(new URL('../assets/badges/gnome-shell.svg', import.meta.url));
    if (!await badge.exists() || await badge.text() !== svg)
        await Bun.write(badge, svg);

    console.log(`GNOME Shell badge: ${label}`);
}

if (import.meta.main)
    await updateGnomeBadge();
